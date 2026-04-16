/**
 * Reconstructs parsed codebase structures from snapshot
 * rows so any command can open a database and build an in-memory tree.
 * It is the only module that transforms stored rows back into parse
 * results — no other module bridges snapshot collections to the tree
 * builder's input shape.
 */

import type {
  KuralDirectory,
  KuralFile,
  KuralFunction,
  KuralType,
  ParseResult,
} from "../analysis/ingestion/parse/types.ts";
import type { SnapshotCollections } from "./collections.ts";

/**
 * Indexes snapshot functions by path into a lookup map.
 * @param fns - Snapshot function collection to index
 * @returns Map from file path to a record of function name to KuralFunction
 * @kuralPure
 */
function indexFunctionsByPath(
  fns: SnapshotCollections["functions"],
): Map<string, Record<string, KuralFunction>> {
  const fnsByPath = new Map<string, Record<string, KuralFunction>>();
  fns.forEach((fn) => {
    let bucket = fnsByPath.get(fn.path);
    if (bucket === undefined) {
      bucket = {};
      fnsByPath.set(fn.path, bucket);
    }
    bucket[fn.name] = {
      name: fn.name,
      path: fn.path,
      identityEmbedding: fn.identityEmbedding,
      leafEmbedding: fn.leafEmbedding,
      facetHash: fn.facetHash,
      description: fn.description,
      params: fn.params,
      paramNames: fn.paramNames,
      returns: fn.returnsType,
      exported: fn.exported,
      pure: fn.pure,
      util: fn.util,
      helper: fn.helper,
      residuals: fn.residuals,
      causes: fn.causes,
      calls: fn.calls,
      patterns: fn.patterns,
      documentedParams: fn.documentedParams,
      hasReturnDoc: fn.hasReturnDoc,
      bound: fn.bound,
    };
  });
  return fnsByPath;
}

/**
 * Indexes snapshot types by path into a lookup map.
 * @param types - Snapshot type collection to index
 * @returns Map from file path to a record of type name to KuralType
 * @kuralPure
 */
function indexTypesByPath(
  types: SnapshotCollections["types"],
): Map<string, Record<string, KuralType>> {
  const typesByPath = new Map<string, Record<string, KuralType>>();
  types.forEach((t) => {
    let bucket = typesByPath.get(t.path);
    if (bucket === undefined) {
      bucket = {};
      typesByPath.set(t.path, bucket);
    }
    bucket[t.name] = {
      name: t.name,
      path: t.path,
      identityEmbedding: t.identityEmbedding,
      leafEmbedding: t.leafEmbedding,
      facetHash: t.facetHash,
      description: t.description,
      fields: t.fields,
      exported: t.exported,
      references: t.refs,
      util: t.util,
      helper: t.helper,
      residuals: t.residuals,
      patterns: t.patterns,
      bound: t.bound,
    };
  });
  return typesByPath;
}

/**
 * Rebuilds a ParseResult from snapshot collections for tree building.
 * Pre-indexes functions and types by path for O(F + Fn + T) instead
 * of O(F * (Fn + T)).
 * @param collections - Snapshot collections containing files, functions,
 *   types, and directories
 * @returns A ParseResult with files and directories reconstructed from
 *   the snapshot
 * @kuralPure
 */
function rebuildParseResult(collections: SnapshotCollections): ParseResult {
  const fnsByPath = indexFunctionsByPath(collections.functions);
  const typesByPath = indexTypesByPath(collections.types);

  const EMPTY_FNS: Record<string, KuralFunction> = {};
  const EMPTY_TYPES: Record<string, KuralType> = {};

  const files: Record<string, KuralFile> = {};
  collections.files.forEach((row) => {
    files[row.path] = {
      name: row.name,
      path: row.path,
      identityEmbedding: row.identityEmbedding,
      leafEmbedding: row.leafEmbedding,
      facetHash: row.facetHash,
      description: row.description,
      functions: fnsByPath.get(row.path) ?? EMPTY_FNS,
      types: typesByPath.get(row.path) ?? EMPTY_TYPES,
      imports: {
        internalImports: row.importsInternal,
        externalImports: row.importsExternal,
      },
      companion: row.companion,
      bound: row.bound,
      helper: row.helper,
      residuals: row.residuals,
    };
  });

  const directories: Record<string, KuralDirectory> = {};
  collections.directories.forEach((row) => {
    directories[row.path] = {
      name: row.name,
      path: row.path,
      identityEmbedding: row.identityEmbedding,
      leafEmbedding: row.leafEmbedding,
      facetHash: row.facetHash,
      children: row.children,
      description: row.description,
      residuals: row.residuals,
      borrows: row.borrows,
    };
  });

  return { files, directories };
}

export { rebuildParseResult };
