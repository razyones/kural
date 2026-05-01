/**
 * Constructs scored node structures from parsed units — shaping
 * functions, types, files, and directories into the typed records that
 * carry embedding vectors, identity hashes, and placement metadata for
 * the scoring engine. Pattern container nodes are synthesized
 * separately by the materializer.
 */

import type { DirectoryNode, FileNode, FunctionNode, TypeNode } from "./tree.ts";
import type {
  KuralDirectory,
  KuralFile,
  KuralFunction,
  KuralType,
} from "../ingestion/parse/types.ts";
import { sha256 } from "../ingestion/embed/hash.ts";

const HASH_LENGTH = 8;
const NONE = 0;

/**
 * Returns the truncated facet hash set during embedding, falling back to
 * a name+path hash for units that were never embedded.
 * @param unit - The unit to read the hash from
 * @param fallbackParts - Fallback strings when facetHash is absent
 * @returns 8-character hex digest
 * @kuralPure
 * @kuralHelper
 */
function unitHash(
  unit: { facetHash?: string; name: string; path: string },
  ...fallbackParts: string[]
): string {
  if (unit.facetHash !== undefined) {
    return unit.facetHash.slice(NONE, HASH_LENGTH);
  }
  // Fallback: embedded units always have facetHash set by resolveCache.
  // This path only covers units skipped during embedding (e.g. tests or
  // dry-run mode) where param-type coverage is not required for correctness.
  return sha256([unit.name, unit.path, ...fallbackParts].join("\0")).slice(NONE, HASH_LENGTH);
}

/**
 * Builds a FunctionNode from a KuralFunction.
 * @param fn - The parsed function data
 * @param filePath - The source file path containing the function
 * @returns A fully constructed FunctionNode
 * @kuralPure
 */
function functionNode(fn: KuralFunction, filePath: string): FunctionNode {
  return {
    key: `func:${filePath}:${fn.name}`,
    kind: "function",
    name: fn.name,
    identity: fn.identityEmbedding,
    leaf: fn.leafEmbedding,
    childKeys: [],
    parentKey: `file:${filePath}`,
    patterns: fn.patterns ?? null,
    companion: null,
    util: fn.util,
    helper: fn.helper,
    residuals: fn.residuals,
    hash: unitHash(fn),
    exported: fn.exported,
    description: fn.description,
    bound: fn.bound ?? null,
    calls: fn.calls,
    returnsType: fn.returns,
    documentedParams: fn.documentedParams,
    hasReturnDoc: fn.hasReturnDoc,
    pure: fn.pure,
    causes: fn.causes,
    paramNames: fn.paramNames,
    paramTypes: fn.params,
    startLine: fn.startLine,
    endLine: fn.endLine,
  };
}

/**
 * Builds a TypeNode from a KuralType.
 * @param type - The parsed type data
 * @param filePath - The source file path containing the type
 * @returns A fully constructed TypeNode
 * @kuralPure
 */
function typeNode(type: KuralType, filePath: string): TypeNode {
  return {
    key: `type:${filePath}:${type.name}`,
    kind: "type",
    name: type.name,
    identity: type.identityEmbedding,
    leaf: type.leafEmbedding,
    childKeys: [],
    parentKey: `file:${filePath}`,
    patterns: type.patterns ?? null,
    companion: null,
    util: type.util,
    helper: type.helper,
    residuals: type.residuals,
    hash: unitHash(type),
    exported: type.exported,
    description: type.description,
    bound: type.bound ?? null,
    startLine: type.startLine,
    endLine: type.endLine,
  };
}

/**
 * Builds a FileNode from a KuralFile.
 * @param file - The parsed file data
 * @param filePath - The source file path
 * @param childKeys - Keys of child nodes (functions and types) in this file
 * @returns A fully constructed FileNode
 * @kuralPure
 */
function fileNode(file: KuralFile, filePath: string, childKeys: string[]): FileNode {
  return {
    key: `file:${filePath}`,
    kind: "file",
    name: file.name,
    identity: file.identityEmbedding,
    leaf: file.leafEmbedding,
    childKeys,
    parentKey: null,
    patterns: null,
    companion: file.companion ?? null,
    util: false,
    helper: file.helper,
    residuals: file.residuals,
    hash: unitHash(file),
    exported: false,
    description: file.description,
    bound: file.bound ?? null,
  };
}

/**
 * Builds a DirectoryNode from a KuralDirectory.
 * @param dir - The parsed directory data
 * @param dirPath - The directory path
 * @param childKeys - Keys of child nodes (files and subdirectories)
 * @returns A fully constructed DirectoryNode
 * @kuralPure
 */
function directoryNode(dir: KuralDirectory, dirPath: string, childKeys: string[]): DirectoryNode {
  return {
    key: `dir:${dirPath}`,
    kind: "directory",
    name: dir.name,
    identity: dir.identityEmbedding,
    leaf: dir.leafEmbedding,
    childKeys,
    parentKey: null,
    patterns: null,
    companion: null,
    util: dir.util,
    helper: false,
    residuals: dir.residuals,
    hash: unitHash(dir),
    exported: false,
    description: dir.description,
    bound: null,
    borrows: dir.borrows,
  };
}

export { directoryNode, fileNode, functionNode, typeNode };
