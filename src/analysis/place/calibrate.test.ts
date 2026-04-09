import { bestLeafMatch, calibrate, classifyAxis } from "./calibrate.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFile, makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";

const NONE = 0;
const NEXT = 1;
const E0 = 0.0;
const E05 = 0.5;
const E09 = 0.9;
const E1 = 1.0;

describe("bestLeafMatch — best matching leaf", () => {
  test("returns the leaf with highest similarity", () => {
    const fn1 = makeFunction({
      key: "func:/src/a.ts:foo",
      name: "foo",
      identity: [E1, E0, E0],
    });
    const fn2 = makeFunction({
      key: "func:/src/b.ts:bar",
      name: "bar",
      identity: [E0, E1, E0],
    });
    const nodes = toNodeMap(fn1, fn2);
    const q = [E09, E0, E0];
    const result = bestLeafMatch(q, nodes);

    expect(result.name).toBe("foo");
    expect(result.similarity).toBeGreaterThan(NONE);
  });

  test("returns empty name for no leaves", () => {
    const dir = makeDir({ identity: [E1, E0] });
    const nodes = toNodeMap(dir);
    const result = bestLeafMatch([E1, E0], nodes);

    expect(result.name).toBe("");
    expect(result.similarity).toBe(NONE);
  });

  test("skips leaves with empty identity", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:empty",
      name: "empty",
      identity: [],
    });
    const nodes = toNodeMap(fn);
    const result = bestLeafMatch([E1, E0], nodes);

    expect(result.name).toBe("");
  });
});

describe("classifyAxis — domain vs capability", () => {
  test("classifies as domain when domain fit is higher", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05, E05],
      parentKey: null,
      childKeys: ["dir:/src/auth", "dir:/src/utils"],
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: [E1, E0, E0],
      parentKey: "dir:/src",
      util: false,
    });
    const utils = makeDir({
      key: "dir:/src/utils",
      name: "utils",
      identity: [E0, E0, E1],
      parentKey: "dir:/src",
      util: true,
    });
    const nodes = toNodeMap(root, auth, utils);
    const q = [E09, E0, E0];
    const result = classifyAxis(q, root, nodes);

    expect(result.classification).toBe("domain");
    expect(result.domainFit).toBeGreaterThan(result.capabilityFit);
  });

  test("classifies as capability when util fit is higher", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05, E05],
      parentKey: null,
      childKeys: ["dir:/src/auth", "dir:/src/utils"],
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: [E1, E0, E0],
      parentKey: "dir:/src",
      util: false,
    });
    const utils = makeDir({
      key: "dir:/src/utils",
      name: "utils",
      identity: [E0, E0, E1],
      parentKey: "dir:/src",
      util: true,
    });
    const nodes = toNodeMap(root, auth, utils);
    const q = [E0, E0, E1];
    const result = classifyAxis(q, root, nodes);

    expect(result.classification).toBe("capability");
    expect(result.capabilityFit).toBeGreaterThan(result.domainFit);
  });

  test("returns domain when no domain directories exist", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      parentKey: null,
      childKeys: [],
    });
    const nodes = toNodeMap(root);
    const result = classifyAxis([E1, E0], root, nodes);

    expect(result.classification).toBe("domain");
    expect(result.domainFit).toBe(NONE);
    expect(result.capabilityFit).toBe(NONE);
  });

  test("returns domain when no util directories exist", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      parentKey: null,
      childKeys: ["dir:/src/auth"],
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: [E1, E0],
      parentKey: "dir:/src",
      util: false,
    });
    const nodes = toNodeMap(root, auth);
    const result = classifyAxis([E1, E0], root, nodes);

    expect(result.classification).toBe("domain");
    expect(result.capabilityFit).toBe(NONE);
  });
});

/** Stub embedder returning fixed-length vectors. */
async function stubEmbedder(texts: string[]): Promise<number[][]> {
  const vecs = texts.map(() => [E05, E05]);
  const resolved = await Promise.resolve(vecs);
  return resolved;
}

describe("calibrate — insufficient probes", () => {
  test("returns zero thresholds when fewer than 2 probes", async () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      childKeys: ["dir:/src/auth"],
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      parentKey: "dir:/src",
      childKeys: ["file:/src/auth/login.ts"],
    });
    const file = makeFile({
      key: "file:/src/auth/login.ts",
      name: "login.ts",
      parentKey: "dir:/src/auth",
      description: "Login flow",
    });
    const nodes = toNodeMap(root, auth, file);
    const result = await calibrate(stubEmbedder, nodes, root.key, root);

    expect(result.alienFence).toBe(NONE);
    expect(result.probeCount).toBe(NONE);
  });
});

describe("calibrate — subdirectory probes", () => {
  test("skips subdirectory with no described files", async () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
      childKeys: ["dir:/src/a", "dir:/src/b"],
    });
    const dirA = makeDir({
      key: "dir:/src/a",
      name: "a",
      parentKey: "dir:/src",
      childKeys: ["file:/src/a/f.ts", "dir:/src/a/sub"],
    });
    const fileA = makeFile({
      key: "file:/src/a/f.ts",
      name: "f.ts",
      parentKey: "dir:/src/a",
      description: "File A",
    });
    const sub = makeDir({
      key: "dir:/src/a/sub",
      name: "sub",
      parentKey: "dir:/src/a",
      childKeys: ["file:/src/a/sub/bare.ts"],
    });
    const bare = makeFile({
      key: "file:/src/a/sub/bare.ts",
      name: "bare.ts",
      parentKey: "dir:/src/a/sub",
    });
    const dirB = makeDir({
      key: "dir:/src/b",
      name: "b",
      parentKey: "dir:/src",
      childKeys: ["file:/src/b/g.ts"],
    });
    const fileB = makeFile({
      key: "file:/src/b/g.ts",
      name: "g.ts",
      parentKey: "dir:/src/b",
      description: "File B",
    });
    const leaf = makeFunction({
      key: "func:/src/a/f.ts:fn",
      name: "fn",
      parentKey: "file:/src/a/f.ts",
      identity: [E1, E0],
    });
    const nodes = toNodeMap(root, dirA, fileA, sub, bare, dirB, fileB, leaf);
    const result = await calibrate(stubEmbedder, nodes, root.key, root);

    expect(result.probeCount).toBeGreaterThanOrEqual(NEXT);
  });
});
