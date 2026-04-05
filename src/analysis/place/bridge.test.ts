import { classifyBridgeType, routeByLayer } from "./bridge.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, toNodeMap } from "../../../tests/helpers/audits.ts";

const E0 = 0.0;
const E05 = 0.5;
const E09 = 0.9;
const E1 = 1.0;

describe("routeByLayer — root layer", () => {
  test("returns root for root layer", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      identity: [E05, E05],
    });
    const nodes = toNodeMap(root);
    const result = routeByLayer("root", [E1, E0], nodes, { key: root.key, node: root });

    expect(result).not.toBeNull();
    expect(result?.parentKey).toBe("dir:/src");
    expect(result?.parentName).toBe("src");
  });
});

describe("routeByLayer — command layer", () => {
  test("routes to best matching command directory", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      childKeys: ["dir:/src/commands"],
      identity: [E05, E05],
    });
    const commands = makeDir({
      key: "dir:/src/commands",
      name: "commands",
      parentKey: "dir:/src",
      childKeys: ["dir:/src/commands/auth", "dir:/src/commands/api"],
      identity: [E05, E05],
    });
    const auth = makeDir({
      key: "dir:/src/commands/auth",
      name: "auth",
      parentKey: "dir:/src/commands",
      identity: [E1, E0],
    });
    const api = makeDir({
      key: "dir:/src/commands/api",
      name: "api",
      parentKey: "dir:/src/commands",
      identity: [E0, E1],
    });
    const nodes = toNodeMap(root, commands, auth, api);
    const result = routeByLayer("command", [E09, E0], nodes, { key: root.key, node: root });

    expect(result).not.toBeNull();
    expect(result?.parentName).toBe("auth");
  });

  test("returns null when no commands directory exists", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      identity: [E05, E05],
    });
    const nodes = toNodeMap(root);
    const result = routeByLayer("command", [E1, E0], nodes, { key: root.key, node: root });

    expect(result).toBeNull();
  });
});

describe("routeByLayer — domain layer", () => {
  test("routes to best domain directory", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      childKeys: ["dir:/src/auth", "dir:/src/api"],
      identity: [E05, E05],
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      parentKey: "dir:/src",
      identity: [E1, E0],
      leaf: [E1, E0],
      util: false,
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      parentKey: "dir:/src",
      identity: [E0, E1],
      leaf: [E0, E1],
      util: false,
    });
    const nodes = toNodeMap(root, auth, api);
    const result = routeByLayer("domain", [E09, E0], nodes, { key: root.key, node: root });

    expect(result).not.toBeNull();
    expect(result?.parentName).toBe("auth");
  });

  test("descends one level into subdirectories", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      childKeys: ["dir:/src/auth"],
      identity: [E05, E05],
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      parentKey: "dir:/src",
      childKeys: ["dir:/src/auth/tokens", "dir:/src/auth/sessions"],
      identity: [E1, E0],
      leaf: [E1, E0],
      util: false,
    });
    const tokens = makeDir({
      key: "dir:/src/auth/tokens",
      name: "tokens",
      parentKey: "dir:/src/auth",
      identity: [E09, E0],
      leaf: [E09, E0],
    });
    const sessions = makeDir({
      key: "dir:/src/auth/sessions",
      name: "sessions",
      parentKey: "dir:/src/auth",
      identity: [E0, E1],
      leaf: [E0, E1],
    });
    const nodes = toNodeMap(root, auth, tokens, sessions);
    const result = routeByLayer("domain", [E09, E0], nodes, { key: root.key, node: root });

    expect(result).not.toBeNull();
    expect(result?.parentName).toBe("tokens");
  });

  test("skips util directories", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      childKeys: ["dir:/src/utils"],
      identity: [E05, E05],
    });
    const utils = makeDir({
      key: "dir:/src/utils",
      name: "utils",
      parentKey: "dir:/src",
      identity: [E1, E0],
      leaf: [E1, E0],
      util: true,
    });
    const nodes = toNodeMap(root, utils);
    const result = routeByLayer("domain", [E1, E0], nodes, { key: root.key, node: root });

    expect(result).toBeNull();
  });
});

describe("routeByLayer — unknown layer", () => {
  test("returns null for unrecognized layer", () => {
    const root = makeDir({ key: "dir:/src", name: "src", parentKey: null });
    const nodes = toNodeMap(root);
    const result = routeByLayer("unknown", [E1, E0], nodes, { key: root.key, node: root });

    expect(result).toBeNull();
  });
});

const NONE = 0;

/** Embedder that returns specific vectors per index. */
async function confidentEmbedder(texts: string[]): Promise<number[][]> {
  const vecs = texts.map((_, i) => (i === NONE ? [E1, E0] : [E0, E1]));
  const resolved = await Promise.resolve(vecs);
  return resolved;
}

/** Embedder that returns identical vectors for all types. */
async function uniformEmbedder(texts: string[]): Promise<number[][]> {
  const vecs = texts.map(() => [E1, E0]);
  const resolved = await Promise.resolve(vecs);
  return resolved;
}

/** Embedder that returns vectors orthogonal to [1,0]. */
async function orthogonalEmbedder(texts: string[]): Promise<number[][]> {
  const vecs = texts.map(() => [E0, E1]);
  const resolved = await Promise.resolve(vecs);
  return resolved;
}

describe("classifyBridgeType — confident result", () => {
  test("returns confident when top sim high and gap large", async () => {
    const q = [E1, E0];
    const result = await classifyBridgeType(confidentEmbedder, q);

    expect(result.confident).toBe(true);
    expect(result.confidence).toBeGreaterThan(E05);
    expect(result.gap).toBeGreaterThan(E0);
    expect(result.alternatives.length).toBeGreaterThan(NONE);
  });
});

describe("classifyBridgeType — uncertain result", () => {
  test("returns not confident when all types equidistant", async () => {
    const q = [E1, E0];
    const result = await classifyBridgeType(uniformEmbedder, q);

    expect(result.confident).toBe(false);
    expect(result.gap).toBe(NONE);
  });

  test("returns not confident when top sim is low", async () => {
    const q = [E1, E0];
    const result = await classifyBridgeType(orthogonalEmbedder, q);

    expect(result.confident).toBe(false);
    expect(result.type).toBeDefined();
    expect(result.layer).toBeDefined();
  });
});
