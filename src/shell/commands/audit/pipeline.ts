/**
 * The lens. Reads a stored snapshot and runs the diagnostic engine to
 * produce a report. It is the only module that bridges database state
 * to the issue pipeline — no other module orchestrates the
 * read-evaluate flow.
 */

import type {
  KuralDirectory,
  KuralFile,
  KuralFunction,
  KuralType,
} from "../../../analysis/ingestion/parse/types.ts";
import { activePath, closeSnapshot, currentBranch, openSnapshot } from "../../../db/snapshot.ts";
import type { AuditReport } from "../../../analysis/audits/detect.ts";
import type { AuditsConfig } from "../../config/audits.ts";
import type { NodeMap } from "../../../analysis/tree/tree.ts";
import type { ParseResult } from "../../../analysis/ingestion/parse/pipeline.ts";
import type { SnapshotCollections } from "../../../db/collections.ts";
import { buildTree } from "../../../analysis/tree/tree.ts";
import { detect } from "../../../analysis/audits/detect.ts";
import { existsSync } from "node:fs";

/** Result from the audit pipeline. */
type AuditPipelineResult = {
  report: AuditReport;
  nodes: NodeMap;
  dbPath: string;
  createdAt: number | null;
};

/**
 * Restores axis scores from snapshot metadata so the identity-language audit can evaluate is-does balance.
 * @param text - JSON string to parse
 * @returns A record of string keys to number values, or null if input is not a valid object
 * @kuralPure
 * @kuralHelper
 */
function parseNumberRecord(text: string): Record<string, number> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "number") {
      record[k] = v;
    }
  }
  return record;
}

/**
 * Runs the audit pipeline: read snapshot → build tree → detect findings.
 * @param root - Absolute path to the project root
 * @param config - Audit sensitivity and tuning parameters
 * @param disabledAudits - Set of audit names to skip
 * @returns The audit report and the node map used for formatting
 * @kuralCauses reads snapshot database and runs detection
 */
async function runAudits(
  root: string,
  config: AuditsConfig,
  disabledAudits: Set<string> = new Set(),
): Promise<AuditPipelineResult> {
  const branch = currentBranch();
  const dbPath = activePath(root, branch);
  if (!existsSync(dbPath)) {
    throw new Error("No active database found — run generate first");
  }

  const snapshot = await openSnapshot(dbPath);

  try {
    const result = rebuildParseResult(snapshot.collections);
    const nodes = buildTree(result);

    let axisScores: Record<string, number> | null = null;
    let createdAt: number | null = null;
    const metaCreatedAt = snapshot.collections.metadata.get("created_at");
    if (metaCreatedAt !== undefined) {
      createdAt = Number(metaCreatedAt.value);
    }
    const metaAxis = snapshot.collections.metadata.get("axis-scores:is-does");
    if (metaAxis !== undefined) {
      axisScores = parseNumberRecord(metaAxis.value);
    }

    const report = detect(nodes, config, axisScores, disabledAudits);
    return { report, nodes, dbPath, createdAt };
  } finally {
    await closeSnapshot(snapshot);
  }
}

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
 * Pre-indexes functions and types by path for O(F + Fn + T) instead of O(F * (Fn + T)).
 * @param collections - Snapshot collections containing files, functions, types, and directories
 * @returns A ParseResult with files and directories reconstructed from the snapshot
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
    };
  });

  return { files, directories };
}

export { rebuildParseResult, runAudits };
export type { AuditPipelineResult };
