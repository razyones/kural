/**
 * The lens. Provides rich semantic information about code symbols by
 * leveraging the TypeScript Language Service. It is the only module
 * that creates a Language Service instance — no other module accesses
 * hover-level type resolution.
 */

import type { SymbolInfo } from "./types.ts";
import { readFileSync } from "node:fs";
import ts from "typescript";

const NONE = 0;

/**
 * Extracts SymbolInfo for all named functions and types in a source file.
 * @param filePath - Absolute path to the TypeScript source file
 * @returns Map of symbol names to their structured display information
 * @kuralCauses reads source files from disk via TypeScript Language Service
 */
function extractSymbolInfos(filePath: string): Map<string, SymbolInfo> {
  const result = new Map<string, SymbolInfo>();
  const sourceText = readFileSync(filePath, "utf-8");

  const host = createHost(filePath, sourceText);
  const service = ts.createLanguageService(host);
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  visitNode(sourceFile, sourceFile, filePath, service, result);

  return result;
}

/**
 * Creates a minimal LanguageServiceHost for a single file.
 * @param filePath - Path to the source file
 * @param sourceText - Content of the source file
 * @returns A LanguageServiceHost implementation
 * @kuralPure
 */
function createHost(filePath: string, sourceText: string): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => [filePath],
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName: string) => {
      if (fileName === filePath) {
        return ts.ScriptSnapshot.fromString(sourceText);
      }
      try {
        return ts.ScriptSnapshot.fromString(readFileSync(fileName, "utf-8"));
      } catch {
        /* file not found — Language Service will skip it */
      }
    },
    getCurrentDirectory: () => ".",
    getCompilationSettings: () => ({ target: ts.ScriptTarget.Latest }),
    getDefaultLibFileName: (options: ts.CompilerOptions) => ts.getDefaultLibFilePath(options),
    readFile: (path: string) => ts.sys.readFile(path),
    fileExists: (path: string) => ts.sys.fileExists(path),
  };
}

/**
 * Visits AST nodes to extract SymbolInfo for functions and types.
 * @param node - Current AST node to visit
 * @param sourceFile - The source file for position resolution
 * @param filePath - Path to the source file
 * @param service - TypeScript Language Service instance
 * @param result - Map to collect results into
 * @kuralPure
 * @kuralHelper
 */
function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  filePath: string,
  service: ts.LanguageService,
  result: Map<string, SymbolInfo>,
): void {
  if (ts.isFunctionDeclaration(node) && node.name) {
    const info = getSymbolInfo(service, filePath, node.name.getStart(sourceFile));
    if (info !== undefined) {
      result.set(node.name.text, info);
    }
  }

  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    const info = getSymbolInfo(service, filePath, node.name.getStart(sourceFile));
    if (info !== undefined) {
      result.set(node.name.text, info);
    }
  }

  ts.forEachChild(node, (child) => {
    visitNode(child, sourceFile, filePath, service, result);
  });
}

/**
 * Converts TypeScript QuickInfo into a SymbolInfo.
 * @param service - TypeScript Language Service
 * @param filePath - Path to the source file
 * @param position - Character offset of the symbol name
 * @returns SymbolInfo or undefined if no info available
 * @kuralPure
 */
function getSymbolInfo(
  service: ts.LanguageService,
  filePath: string,
  position: number,
): SymbolInfo | undefined {
  const quickInfo = service.getQuickInfoAtPosition(filePath, position);
  if (quickInfo === undefined || quickInfo.displayParts === undefined) {
    return undefined;
  }

  if (quickInfo.displayParts.length === NONE) {
    return undefined;
  }

  const documentation = ts.displayPartsToString(quickInfo.documentation);
  const tags = (quickInfo.tags ?? []).map((tag) => ({
    name: tag.name,
    text: tag.text?.map((t) => t.text).join(""),
  }));

  return {
    displayParts: quickInfo.displayParts.map((p) => ({ kind: p.kind, text: p.text })),
    documentation,
    tags,
  };
}

export { extractSymbolInfos };
