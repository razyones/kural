/**
 * The assembler. Coordinates the scout, dissector, and interpreter to produce
 * a complete tree of code units from a directory. It is the only entry point
 * into the parse pipeline — nothing else in the system triggers parsing.
 */

import type { BorrowsEntry, KuralDirectory, KuralFile, ResidualEntry } from "./types.ts";
import { basename, dirname, join } from "node:path";
import { extractFile } from "./extract.ts";
import { readFile } from "node:fs/promises";
import { walk } from "./walk.ts";

const RESIDUAL_PREFIX = "@kuralResidual";
const BORROWS_PREFIX = "@kuralBorrows";
const AUDIT_NAME = 0;
const AUDIT_HASH = 1;
const AFTER_QUOTE = 1;
const NOT_FOUND = -1;

const EMPTY_EMBEDDING: number[] = [];

/** Parsed codebase: files and directories keyed by absolute path. */
type ParseResult = {
  files: Record<string, KuralFile>;
  directories: Record<string, KuralDirectory>;
};

/**
 * Parses a @kuralBorrows directive from a single line.
 * @param rest - The text after the @kuralBorrows prefix
 * @returns A BorrowsEntry, or null if the line is malformed
 * @kuralPure
 * @kuralHelper
 */
function parseBorrowsLine(rest: string): BorrowsEntry | null {
  const quoteStart = rest.indexOf('"');
  const quoteEnd = rest.lastIndexOf('"');
  if (quoteStart === NOT_FOUND || quoteEnd <= quoteStart) {
    return null;
  }
  const beforeQuote = rest.slice(AUDIT_NAME, quoteStart).trim();
  const role = rest.slice(quoteStart + AFTER_QUOTE, quoteEnd);
  if (role === "") {
    return null;
  }
  return {
    role,
    target: beforeQuote.length > AUDIT_NAME ? beforeQuote : undefined,
  };
}

/**
 * Parses @kuralResidual and @kuralBorrows lines from KURAL.md content.
 * @param content - The raw KURAL.md text
 * @returns Object with description, residual entries, and optional borrows
 * @kuralPure
 */
function parseKuralMdDirectives(content: string): {
  description: string;
  residuals: ResidualEntry[];
  borrows?: BorrowsEntry;
} {
  const residuals: ResidualEntry[] = [];
  const descLines: string[] = [];
  let borrows: BorrowsEntry | undefined;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(RESIDUAL_PREFIX)) {
      const rest = trimmed.slice(RESIDUAL_PREFIX.length).trim();
      const parts = rest.split(/\s+/);
      if (parts.length > AUDIT_NAME && parts[AUDIT_NAME] !== "") {
        const rawHash = parts[AUDIT_HASH];
        residuals.push({ audit: parts[AUDIT_NAME], hash: rawHash?.replaceAll(/[[\]]/g, "") });
      }
    } else if (trimmed.startsWith(BORROWS_PREFIX)) {
      const rest = trimmed.slice(BORROWS_PREFIX.length).trim();
      const parsed = parseBorrowsLine(rest);
      if (parsed !== null) {
        borrows = parsed;
      }
    } else {
      descLines.push(line);
    }
  }
  return { description: descLines.join("\n").trim(), residuals, borrows };
}

/**
 * Reads the KURAL.md file from a directory if it exists.
 * @param dirPath - Absolute path to the directory
 * @returns The description and residual entries, or defaults if absent
 * @kuralCauses Reads a KURAL.md file from disk
 */
async function readKuralMd(
  dirPath: string,
): Promise<{ description?: string; residuals: ResidualEntry[]; borrows?: BorrowsEntry }> {
  try {
    const content = await readFile(join(dirPath, "KURAL.md"), "utf-8");
    const parsed = parseKuralMdDirectives(content);
    return {
      description: parsed.description || undefined,
      residuals: parsed.residuals,
      borrows: parsed.borrows,
    };
  } catch {
    return { description: undefined, residuals: [] };
  }
}

/**
 * Parses a directory into structured code units and assembles the folder tree.
 * Walks the filesystem, extracts types and functions from each .ts file,
 * and builds the parent-child directory hierarchy.
 * @param dir - Absolute path to the root directory to parse
 * @returns Files and directories keyed by absolute path, with empty embeddings
 * @kuralCauses Reads source files from disk via walk and extract
 */
/**
 * Wires parent-child relationships between files, subdirectories, and their parent directories.
 * @param directories - The directory map to mutate
 * @param filePaths - Absolute paths of parsed files
 * @param subDirs - Absolute paths of discovered subdirectories
 * @kuralCauses mutates directory children arrays
 * @kuralHelper
 */
function wireChildren(
  directories: Record<string, KuralDirectory>,
  filePaths: string[],
  subDirs: string[],
): void {
  for (const filePath of filePaths) {
    const parent = dirname(filePath);
    if (parent in directories) {
      directories[parent].children.push(filePath);
    }
  }
  for (const subDir of subDirs) {
    const parent = dirname(subDir);
    if (parent in directories) {
      directories[parent].children.push(subDir);
    }
  }
}

async function parse(dir: string): Promise<ParseResult> {
  const walkResult = await walk(dir);

  const files: Record<string, KuralFile> = {};
  for (const filePath of walkResult.files) {
    try {
      const extracted = extractFile(filePath);
      files[filePath] = {
        ...extracted,
        identityEmbedding: EMPTY_EMBEDDING,
        leafEmbedding: EMPTY_EMBEDDING,
      };
    } catch (err) {
      console.error(
        `Warning: skipping ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const directories: Record<string, KuralDirectory> = {};
  for (const dirPath of [dir, ...walkResult.directories]) {
    const kural = await readKuralMd(dirPath);
    directories[dirPath] = {
      name: basename(dirPath),
      path: dirPath,
      identityEmbedding: EMPTY_EMBEDDING,
      leafEmbedding: EMPTY_EMBEDDING,
      children: [],
      description: kural.description,
      residuals: kural.residuals,
      borrows: kural.borrows,
    };
  }

  wireChildren(directories, walkResult.files, walkResult.directories);
  return { files, directories };
}

export { parse };
export type { ParseResult };
