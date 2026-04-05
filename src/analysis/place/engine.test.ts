import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFile, makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";
import type { NodeMap } from "../tree/tree.ts";
import { place } from "./engine.ts";

const NONE = 0;
const E0 = 0.0;
const E05 = 0.5;
const E09 = 0.9;
const E1 = 1.0;

/**
 * Builds a simple tree with root -> two domain dirs -> files with functions.
 * Each domain has a file with a function leaf node.
 */
function buildSimpleTree(): NodeMap {
  const root = makeDir({
    key: "dir:/src",
    name: "src",
    identity: [E05, E05, E05],
    leaf: [E05, E05, E05],
    childKeys: ["dir:/src/auth", "dir:/src/api"],
    parentKey: null,
  });
  const auth = makeDir({
    key: "dir:/src/auth",
    name: "auth",
    identity: [E1, E0, E0],
    leaf: [E1, E0, E0],
    childKeys: ["file:/src/auth/login.ts"],
    parentKey: "dir:/src",
    description: "Authentication logic",
  });
  const authFile = makeFile({
    key: "file:/src/auth/login.ts",
    name: "login.ts",
    identity: [E09, E0, E0],
    leaf: [E09, E0, E0],
    childKeys: ["func:/src/auth/login.ts:authenticate"],
    parentKey: "dir:/src/auth",
    description: "Login flow",
  });
  const authFn = makeFunction({
    key: "func:/src/auth/login.ts:authenticate",
    name: "authenticate",
    identity: [E09, E0, E0],
    leaf: [E09, E0, E0],
    parentKey: "file:/src/auth/login.ts",
  });
  const api = makeDir({
    key: "dir:/src/api",
    name: "api",
    identity: [E0, E1, E0],
    leaf: [E0, E1, E0],
    childKeys: ["file:/src/api/routes.ts"],
    parentKey: "dir:/src",
    description: "API routes",
  });
  const apiFile = makeFile({
    key: "file:/src/api/routes.ts",
    name: "routes.ts",
    identity: [E0, E09, E0],
    leaf: [E0, E09, E0],
    childKeys: ["func:/src/api/routes.ts:getRoutes"],
    parentKey: "dir:/src/api",
    description: "Route definitions",
  });
  const apiFn = makeFunction({
    key: "func:/src/api/routes.ts:getRoutes",
    name: "getRoutes",
    identity: [E0, E09, E0],
    leaf: [E0, E09, E0],
    parentKey: "file:/src/api/routes.ts",
  });
  return toNodeMap(root, auth, authFile, authFn, api, apiFile, apiFn);
}

/** Simple embedder that returns the input text as a trivial 3D vector. */
async function mockEmbedder(texts: string[]): Promise<number[][]> {
  const vectors = texts.map((t) => {
    const len = t.length;
    const MOD_A = 37;
    const MOD_B = 53;
    const MOD_C = 71;
    const NORM = 100;
    return [(len % MOD_A) / NORM, (len % MOD_B) / NORM, (len % MOD_C) / NORM];
  });
  const resolved = await Promise.resolve(vectors);
  return resolved;
}

describe("place — end to end", () => {
  test("returns a valid PlacementResult", async () => {
    const nodes = buildSimpleTree();
    const result = await place("user authentication handler", nodes, mockEmbedder);

    expect(result.query).toBe("user authentication handler");
    expect(result.axis.classification).toBeDefined();
    expect(result.detection).toBeDefined();
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion.action).toBeDefined();
    expect(typeof result.confidence).toBe("number");
    expect(result.topPaths.length).toBeGreaterThan(NONE);
  });

  test("includes axis classification", async () => {
    const nodes = buildSimpleTree();
    const result = await place("login form validator", nodes, mockEmbedder);

    expect(["domain", "capability"]).toContain(result.axis.classification);
    expect(typeof result.axis.domainFit).toBe("number");
    expect(typeof result.axis.capabilityFit).toBe("number");
  });

  test("detection section has all required fields", async () => {
    const nodes = buildSimpleTree();
    const result = await place("database connection pool", nodes, mockEmbedder);

    expect(typeof result.detection.alienFence).toBe("number");
    expect(typeof result.detection.probeCount).toBe("number");
    expect(result.detection.bestLeafMatch).toBeDefined();
    expect(typeof result.detection.chainGap).toBe("number");
    expect(typeof result.detection.globalAlien).toBe("boolean");
  });
});
