/**
 * The compass needle. Opens a snapshot, rebuilds the code tree, and
 * delegates to the engine for the advise command. It is the only module
 * that bridges stored state to the engine for this command — no other
 * module orchestrates the snapshot-to-engine flow for directory advice.
 */

import type { AdviseResult, NamedVector } from "../../../analysis/advise/analyze.ts";
import type { CodeNode, NodeMap } from "../../../analysis/tree/tree.ts";
import { activePath, closeSnapshot, currentBranch, openSnapshot } from "../../../db/snapshot.ts";
import { analyzeFromDescriptions, analyzeFromTree } from "../../../analysis/advise/analyze.ts";
import { buildTree, getChildren } from "../../../analysis/tree/tree.ts";
import { existsSync, readFileSync } from "node:fs";
import { createEmbeddingModel } from "../../../analysis/ingestion/embed/model.ts";
import { rebuildParseResult } from "../../../db/rebuild.ts";
import { resolve } from "node:path";

const NONE = 0;
const DEFAULT_DEPTH = 1;
const DIR_PREFIX = "dir:";

/** Result bundle returned by `runAdvise`. */
type AdvisePipelineResult = {
  results: AdviseResult[];
  dbPath: string;
  branch: string;
};

/** Shape of a single entry in the description-mode JSON file. */
type DescriptionEntry = {
  name: string;
  description: string;
};

/**
 * Safely extracts a string property from an unknown object by key.
 * @param obj - The object to read from (must be a non-null object)
 * @param key - The property name to extract
 * @returns The string value, or null if the property is missing or not a string
 * @kuralPure
 * @kuralHelper
 */
function extractString(obj: object, key: string): string | null {
  if (!(key in obj)) {
    return null;
  }
  const value: unknown = Object.getOwnPropertyDescriptor(obj, key)?.value;
  return typeof value === "string" ? value : null;
}

/**
 * Validates that a parsed unknown value is an array of DescriptionEntry objects.
 * @param data - The unknown value to validate
 * @returns A validated array of DescriptionEntry objects, or null if invalid
 * @kuralPure
 * @kuralHelper
 */
function validateDescriptionEntries(data: unknown): DescriptionEntry[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  const entries: DescriptionEntry[] = [];
  for (const entry of data as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const item: object = entry;
    const name = extractString(item, "name");
    const description = extractString(item, "description");
    if (name === null || description === null) {
      return null;
    }
    entries.push({ name, description });
  }
  return entries;
}

/**
 * Parses a JSON file containing description entries with runtime validation.
 * @param filePath - Absolute path to the JSON file
 * @returns A validated array of DescriptionEntry objects
 * @kuralPure
 */
function readDescriptionFile(filePath: string): DescriptionEntry[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read description file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${filePath}`);
  }
  const entries = validateDescriptionEntries(parsed);
  if (entries === null || entries.length === NONE) {
    throw new Error(`Expected non-empty array of { name, description } in ${filePath}`);
  }
  return entries;
}

/**
 * Finds the target directory node by absolute path in the node map.
 * @param absolutePath - Absolute filesystem path of the target directory
 * @param nodes - The flat node map to search
 * @returns The matching CodeNode, or null if not found
 * @kuralPure
 * @kuralHelper
 */
function findDirectoryNode(absolutePath: string, nodes: NodeMap): CodeNode | null {
  const key = `${DIR_PREFIX}${absolutePath}`;
  return nodes.get(key) ?? null;
}

/**
 * Collects advise results for child directories up to the given depth.
 * @param node - The starting directory node
 * @param nodes - The flat node map for lookups
 * @param useLeaf - Whether to use leaf vectors instead of identity
 * @param depth - Remaining recursion depth
 * @returns Array of non-null AdviseResult entries
 * @kuralPure
 */
function collectChildResults(
  node: CodeNode,
  nodes: NodeMap,
  useLeaf: boolean,
  depth: number,
): AdviseResult[] {
  const results: AdviseResult[] = [];
  const children = getChildren(node, nodes);
  for (const child of children) {
    if (child.kind !== "directory") {
      continue;
    }
    const childResult = analyzeFromTree(child, nodes, useLeaf);
    if (childResult !== null) {
      results.push(childResult);
    }
    if (depth > DEFAULT_DEPTH) {
      const nested = collectChildResults(child, nodes, useLeaf, depth - DEFAULT_DEPTH);
      results.push(...nested);
    }
  }
  return results;
}

/**
 * Opens the snapshot, builds the tree, finds the target directory,
 * and delegates to the engine in snapshot mode.
 * @param root - Absolute path to the project root
 * @param targetPath - Relative or absolute path of the directory to analyze
 * @param useLeaf - Whether to use leaf vectors instead of identity
 * @param depth - How many directory levels deep to analyze (default 1)
 * @returns Pipeline result with advise results, database path, and branch
 * @kuralCauses reads snapshot database and runs analysis
 */
async function runAdvise(
  root: string,
  targetPath: string,
  useLeaf: boolean,
  depth: number = DEFAULT_DEPTH,
): Promise<AdvisePipelineResult> {
  const branch = currentBranch();
  const dbPath = activePath(root, branch);
  if (!existsSync(dbPath)) {
    throw new Error("No active database found — run generate first");
  }

  const snapshot = await openSnapshot(dbPath);

  try {
    const parseResult = rebuildParseResult(snapshot.collections);
    const nodes = buildTree(parseResult);
    const absolutePath = resolve(root, targetPath);
    const targetNode = findDirectoryNode(absolutePath, nodes);

    if (targetNode === null) {
      throw new Error(`Directory not found in snapshot: ${targetPath}`);
    }

    const results: AdviseResult[] = [];
    const topResult = analyzeFromTree(targetNode, nodes, useLeaf);
    if (topResult !== null) {
      results.push(topResult);
    }

    if (depth > DEFAULT_DEPTH) {
      const childResults = collectChildResults(targetNode, nodes, useLeaf, depth - DEFAULT_DEPTH);
      results.push(...childResults);
    }

    if (results.length === NONE) {
      throw new Error(`No analyzable children found in ${targetPath}`);
    }

    return { results, dbPath, branch };
  } finally {
    await closeSnapshot(snapshot);
  }
}

/**
 * Reads a JSON file of named descriptions, embeds them, and delegates
 * to the engine in description mode (no snapshot required).
 * @param filePath - Absolute path to the JSON description file
 * @param provider - Embedding provider name (e.g. "openai", "openrouter")
 * @param model - Optional model ID override
 * @param apiKey - Optional API key for the provider
 * @returns A single AdviseResult from the embedded descriptions
 * @kuralCauses reads file, calls embedding API, runs analysis
 */
async function runAdviseFromFile(
  filePath: string,
  provider?: string,
  model?: string,
  apiKey?: string,
): Promise<AdviseResult> {
  const entries = readDescriptionFile(filePath);
  const defaultProvider = provider ?? "openrouter";

  const { embed } = createEmbeddingModel({
    provider: defaultProvider,
    ...(model === undefined ? {} : { model }),
    ...(apiKey === undefined ? {} : { apiKey }),
  });

  const descriptions = entries.map((e) => e.description);
  const embeddings = await embed(descriptions);

  const items: NamedVector[] = entries.map((entry, index) => {
    const vec = embeddings[index] ?? [];
    return { name: entry.name, identity: vec, leaf: vec };
  });

  const result = analyzeFromDescriptions(items);
  if (result === null) {
    throw new Error("Analysis returned no result — need at least 2 items");
  }
  return result;
}

export { runAdvise, runAdviseFromFile };
export type { AdvisePipelineResult };
