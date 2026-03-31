/**
 * Node builders. Constructs FunctionNode, TypeNode, FileNode, and
 * DirectoryNode instances from parsed units. These are pure factory
 * functions with no side effects.
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
 * Computes a short SHA-256 hash for change detection.
 * @param parts - Strings to hash together
 * @returns 8-character hex digest
 * @kuralPure
 */
function computeHash(...parts: string[]): string {
  return sha256(parts.join("\0")).slice(NONE, HASH_LENGTH);
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
    hash: computeHash(fn.name, fn.path, ...fn.params),
    exported: fn.exported,
    description: fn.description,
    calls: fn.calls,
    returnsType: fn.returns,
    documentedParams: fn.documentedParams,
    hasReturnDoc: fn.hasReturnDoc,
    pure: fn.pure,
    causes: fn.causes,
    paramNames: fn.paramNames,
    paramTypes: fn.params,
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
    hash: computeHash(type.name, type.path, ...Object.keys(type.fields)),
    exported: type.exported,
    description: type.description,
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
    helper: false,
    residuals: file.residuals,
    hash: computeHash(file.name, filePath),
    exported: false,
    description: file.description,
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
    util: false,
    helper: false,
    residuals: dir.residuals,
    hash: computeHash(dir.name, dirPath),
    exported: false,
    description: dir.description,
  };
}

export { directoryNode, fileNode, functionNode, typeNode };
