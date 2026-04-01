/**
 * Shared test helpers for audit definition tests.
 * Provides factory functions for mock CodeNode objects.
 */

import type {
  CodeNode,
  DirectoryNode,
  FileNode,
  FunctionNode,
  NodeMap,
  TypeNode,
} from "../../src/sost/tree.ts";
import type { FormatCtx } from "../../src/audits/types.ts";
import type { ResidualEntry } from "../../src/ingestion/parse/types.ts";

const HASH_LEN = 8;
const NONE = 0;

/** Generates a short deterministic hash from a seed string. */
function mockHash(seed: string): string {
  return seed.padEnd(HASH_LEN, "0").slice(NONE, HASH_LEN);
}

/** Creates a mock FunctionNode with sensible defaults and partial overrides. */
function makeFunction(overrides: Partial<FunctionNode> = {}): FunctionNode {
  const name = overrides.name ?? "doStuff";
  const parentKey = overrides.parentKey ?? "file:/src/app.ts";
  return {
    key: overrides.key ?? `func:/src/app.ts:${name}`,
    kind: "function",
    name,
    identity: overrides.identity ?? [],
    leaf: overrides.leaf ?? [],
    childKeys: [],
    parentKey,
    patterns: overrides.patterns ?? null,
    companion: overrides.companion ?? null,
    util: overrides.util ?? false,
    helper: overrides.helper ?? false,
    residuals: overrides.residuals ?? [],
    hash: overrides.hash ?? mockHash(name),
    exported: overrides.exported ?? true,
    description: overrides.description ?? undefined,
    bound: overrides.bound ?? null,
    calls: overrides.calls ?? [],
    returnsType: overrides.returnsType ?? "void",
    documentedParams: overrides.documentedParams ?? NONE,
    hasReturnDoc: overrides.hasReturnDoc ?? false,
    pure: overrides.pure ?? false,
    causes: overrides.causes ?? undefined,
    paramNames: overrides.paramNames ?? [],
    paramTypes: overrides.paramTypes ?? [],
  };
}

/** Creates a mock TypeNode with sensible defaults and partial overrides. */
function makeType(overrides: Partial<TypeNode> = {}): TypeNode {
  const name = overrides.name ?? "MyType";
  const parentKey = overrides.parentKey ?? "file:/src/app.ts";
  return {
    key: overrides.key ?? `type:/src/app.ts:${name}`,
    kind: "type",
    name,
    identity: overrides.identity ?? [],
    leaf: overrides.leaf ?? [],
    childKeys: [],
    parentKey,
    patterns: overrides.patterns ?? null,
    companion: overrides.companion ?? null,
    util: overrides.util ?? false,
    helper: overrides.helper ?? false,
    residuals: overrides.residuals ?? [],
    hash: overrides.hash ?? mockHash(name),
    exported: overrides.exported ?? true,
    description: overrides.description ?? undefined,
    bound: overrides.bound ?? null,
  };
}

/** Creates a mock FileNode with sensible defaults and partial overrides. */
function makeFile(overrides: Partial<FileNode> = {}): FileNode {
  const name = overrides.name ?? "app.ts";
  return {
    key: overrides.key ?? "file:/src/app.ts",
    kind: "file",
    name,
    identity: overrides.identity ?? [],
    leaf: overrides.leaf ?? [],
    childKeys: overrides.childKeys ?? [],
    parentKey: overrides.parentKey ?? null,
    patterns: overrides.patterns ?? null,
    companion: overrides.companion ?? null,
    util: overrides.util ?? false,
    helper: overrides.helper ?? false,
    residuals: overrides.residuals ?? [],
    hash: overrides.hash ?? mockHash(name),
    exported: overrides.exported ?? false,
    description: overrides.description ?? undefined,
    bound: overrides.bound ?? null,
  };
}

/** Creates a mock DirectoryNode with sensible defaults and partial overrides. */
function makeDir(overrides: Partial<DirectoryNode> = {}): DirectoryNode {
  const name = overrides.name ?? "src";
  return {
    key: overrides.key ?? "dir:/src",
    kind: "directory",
    name,
    identity: overrides.identity ?? [],
    leaf: overrides.leaf ?? [],
    childKeys: overrides.childKeys ?? [],
    parentKey: overrides.parentKey ?? null,
    patterns: overrides.patterns ?? null,
    companion: overrides.companion ?? null,
    util: overrides.util ?? false,
    helper: overrides.helper ?? false,
    residuals: overrides.residuals ?? [],
    hash: overrides.hash ?? mockHash(name),
    exported: overrides.exported ?? false,
    description: overrides.description ?? undefined,
    bound: overrides.bound ?? null,
  };
}

/** Creates a suppression residual entry for a given audit. */
function suppress(audit: string, hash?: string): ResidualEntry {
  return hash === undefined ? { audit } : { audit, hash };
}

/** Builds a NodeMap from an array of CodeNode objects. */
function toNodeMap(...nodes: CodeNode[]): NodeMap {
  const map: NodeMap = new Map();
  for (const node of nodes) {
    map.set(node.key, node);
  }
  return map;
}

/** Creates a minimal FormatCtx for testing format functions. */
function makeFormatCtx(overrides: Partial<FormatCtx> = {}): FormatCtx {
  return {
    finding: overrides.finding ?? {
      audit: "test",
      key: "test:key",
      name: "testNode",
      hash: "abcd1234",
    },
    label: overrides.label ?? "testNode",
    prefix: overrides.prefix ?? "\u25B8",
    location: overrides.location ?? "",
    labelNode: overrides.labelNode ?? ((key: string) => key),
    rootPath: overrides.rootPath ?? null,
  };
}

export { makeDir, makeFile, makeFormatCtx, makeFunction, makeType, suppress, toNodeMap };
