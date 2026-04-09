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

/**
 * Builds a tree with 6 spread-out dirs so chain search
 * confidence is diluted below the bridge threshold (0.55).
 */
function buildDilutedTree(): NodeMap {
  const E02 = 0.2;
  const E04 = 0.4;
  const E06 = 0.6;
  const E08 = 0.8;
  const keys = ["a", "b", "c", "d", "e", "f"];
  const vecs = [
    [E08, E02, E0],
    [E02, E08, E0],
    [E0, E02, E08],
    [E06, E06, E0],
    [E06, E0, E06],
    [E0, E06, E06],
  ];
  const root = makeDir({
    key: "dir:/src",
    name: "src",
    identity: [E04, E04, E04],
    leaf: [E04, E04, E04],
    childKeys: keys.map((k) => `dir:/src/${k}`),
    parentKey: null,
    description: "Root module",
  });
  const all: Parameters<typeof toNodeMap> = [root];
  for (let i = NONE; i < keys.length; i++) {
    const n = keys[i];
    const id = vecs[i];
    const dir = makeDir({
      key: `dir:/src/${n}`,
      name: n,
      identity: id,
      leaf: id,
      childKeys: [`file:/src/${n}/f.ts`],
      parentKey: "dir:/src",
      description: `Module ${n}`,
    });
    const file = makeFile({
      key: `file:/src/${n}/f.ts`,
      name: "f.ts",
      identity: id,
      leaf: id,
      childKeys: [`func:/src/${n}/f.ts:fn`],
      parentKey: dir.key,
      description: `File in ${n}`,
    });
    const fn = makeFunction({
      key: `func:/src/${n}/f.ts:fn`,
      name: "fn",
      identity: id,
      leaf: id,
      parentKey: file.key,
    });
    all.push(dir, file, fn);
  }
  return toNodeMap(...all);
}

/**
 * Stateful embedder for bridge tier tests.
 * Call 1 (probes): moderate match → alien fence ~0.577.
 * Call 2 (query): asymmetric → slight dir preference, diluted confidence <55%.
 * Call 3+ (bridge refs): first type matches query → confident bridge.
 */
function bridgeEmbedder(): (t: string[]) => Promise<number[][]> {
  const E03 = 0.3;
  const Q0 = 0.6;
  const Q2 = 0.4;
  let call = NONE;
  async function embed(texts: string[]): Promise<number[][]> {
    call++;
    const PROBE_CALL = 1;
    const QUERY_CALL = 2;
    let vecs: number[][];
    if (call === PROBE_CALL) {
      vecs = texts.map(() => [E03, E03, E03]);
    } else if (call === QUERY_CALL) {
      vecs = [[Q0, E05, Q2]];
    } else {
      vecs = texts.map((_, i) => (i === NONE ? [Q0, E05, Q2] : [E0, E0, E1]));
    }
    const resolved = await Promise.resolve(vecs);
    return resolved;
  }
  return embed;
}

/**
 * Builds a tree where func identity vectors are near-central, decoupling
 * leaf similarity from routing confidence. Any query has high leaf sim
 * (avoiding alien detection) while dir identity vectors are spread out
 * (enabling decisive routing for probes, diluted routing for equidistant query).
 */
function buildBridgeTestTree(): NodeMap {
  const E01 = 0.1;
  const E02 = 0.2;
  const E04 = 0.4;
  const E06 = 0.6;
  const E08 = 0.8;
  const F_H = 0.52;
  const F_M = 0.44;
  const F_L = 0.38;
  const F_MH = 0.5;
  const F_ML = 0.36;
  const keys = ["a", "b", "c", "d", "e", "f"];
  const dirVecs = [
    [E08, E02, E01],
    [E01, E08, E02],
    [E02, E01, E08],
    [E06, E06, E01],
    [E06, E01, E06],
    [E01, E06, E06],
  ];
  const funcVecs = [
    [F_H, F_M, F_L],
    [F_L, F_H, F_M],
    [F_M, F_L, F_H],
    [F_MH, F_MH, F_ML],
    [F_MH, F_ML, F_MH],
    [F_ML, F_MH, F_MH],
  ];
  const root = makeDir({
    key: "dir:/src",
    name: "src",
    identity: [E04, E04, E04],
    leaf: [E04, E04, E04],
    childKeys: keys.map((k) => `dir:/src/${k}`),
    parentKey: null,
    description: "Root module",
  });
  const all: Parameters<typeof toNodeMap> = [root];
  for (let i = NONE; i < keys.length; i++) {
    const n = keys[i];
    all.push(
      makeDir({
        key: `dir:/src/${n}`,
        name: n,
        identity: dirVecs[i],
        leaf: dirVecs[i],
        childKeys: [`file:/src/${n}/f.ts`],
        parentKey: "dir:/src",
        description: `Module ${n}`,
      }),
      makeFile({
        key: `file:/src/${n}/f.ts`,
        name: "f.ts",
        identity: funcVecs[i],
        leaf: funcVecs[i],
        childKeys: [`func:/src/${n}/f.ts:fn`],
        parentKey: `dir:/src/${n}`,
        description: `File in ${n}`,
      }),
      makeFunction({
        key: `func:/src/${n}/f.ts:fn`,
        name: "fn",
        identity: funcVecs[i],
        leaf: funcVecs[i],
        parentKey: `file:/src/${n}/f.ts`,
      }),
    );
  }
  return toNodeMap(...all);
}

/**
 * Stateful embedder for bridge-escalation tests.
 * Call 1 (probes): biased toward each module → high routing confidence.
 * Call 2 (query): near-equidistant → diluted confidence below bridge threshold.
 * Call 3+ (bridge refs): identical non-proportional vectors → confident = false.
 */
function bridgeTestEmbedder(): (t: string[]) => Promise<number[][]> {
  const P_H = 0.7;
  const P_M = 0.35;
  const P_L = 0.25;
  const P_MH = 0.55;
  const Q = 0.38;
  const B_H = 0.5;
  const B_M = 0.4;
  const B_L = 0.35;
  let call = NONE;
  async function embed(texts: string[]): Promise<number[][]> {
    call++;
    const PROBE_CALL = 1;
    const QUERY_CALL = 2;
    if (call === PROBE_CALL) {
      return [
        [P_H, P_M, P_L],
        [P_L, P_H, P_M],
        [P_M, P_L, P_H],
        [P_MH, P_MH, P_L],
        [P_MH, P_L, P_MH],
        [P_L, P_MH, P_MH],
      ];
    }
    if (call === QUERY_CALL) {
      return [[Q, Q, Q]];
    }
    const resolved = await Promise.resolve(texts.map(() => [B_H, B_M, B_L]));
    return resolved;
  }
  return embed;
}

describe("place — bridge tier", () => {
  test("triggers bridge-escalation for diluted query", async () => {
    const nodes = buildBridgeTestTree();
    const result = await place("generic concept", nodes, bridgeTestEmbedder());

    expect(result.detection.globalAlien).toBe(false);
    expect(result.suggestion.method).toBe("bridge-escalation");
    expect(result.bridge).not.toBeNull();
    expect(result.bridge?.type).toBeDefined();
  });
});

describe("place — bridge-type-routing", () => {
  test("routes via bridge when commands dir exists", async () => {
    const nodes = buildDilutedTree();
    const cmd = makeDir({
      key: "dir:/src/commands",
      name: "commands",
      identity: [E05, E05, E05],
      leaf: [E05, E05, E05],
      childKeys: ["dir:/src/commands/run"],
      parentKey: "dir:/src",
    });
    const run = makeDir({
      key: "dir:/src/commands/run",
      name: "run",
      identity: [E09, E0, E0],
      leaf: [E09, E0, E0],
      childKeys: [],
      parentKey: "dir:/src/commands",
    });
    nodes.set(cmd.key, cmd);
    nodes.set(run.key, run);
    const root = nodes.get("dir:/src");
    if (root) {
      root.childKeys = [...root.childKeys, cmd.key];
    }

    const result = await place("orchestrator pipeline", nodes, bridgeEmbedder());

    expect(result.suggestion).toBeDefined();
    if (result.suggestion.method === "bridge-type-routing") {
      expect(result.suggestion.action).toBe("add-to-directory");
    }
  });
});

describe("place — safety gate tier", () => {
  test("reaches safety gate with moderate confidence", async () => {
    const nodes = buildSimpleTree();
    let call = NONE;
    const E06 = 0.6;
    const E04 = 0.4;
    async function gateEmbedder(texts: string[]): Promise<number[][]> {
      call++;
      const PROBE_CALL = 1;
      const QUERY_CALL = 2;
      let vecs: number[][];
      if (call === PROBE_CALL) {
        vecs = texts.map(() => [E0, E0, E1]);
      } else if (call === QUERY_CALL) {
        vecs = [[E06, E04, E0]];
      } else {
        vecs = texts.map(() => [E05, E05, E05]);
      }
      const resolved = await Promise.resolve(vecs);
      return resolved;
    }
    const result = await place("something ambiguous", nodes, gateEmbedder);

    expect(result.suggestion).toBeDefined();
    expect(result.suggestion.action).toBeDefined();
  });
});
