import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFile, toNodeMap } from "../../../tests/helpers/audits.ts";
import { chainSearch } from "./chain.ts";

const NONE = 0;
const NEXT = 1;
const EPSILON = 0.01;
const E0 = 0.0;
const E05 = 0.5;
const E09 = 0.9;
const E1 = 1.0;

describe("chainSearch — leaf-only root", () => {
  test("returns root as sole path when no directory children", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E1, E0],
      leaf: [E1, E0],
      childKeys: ["file:/src/app.ts"],
      parentKey: null,
    });
    const file = makeFile({
      key: "file:/src/app.ts",
      name: "app.ts",
      parentKey: "dir:/src",
      identity: [E1, E0],
      leaf: [E1, E0],
    });
    const nodes = toNodeMap(root, file);
    const q = [E09, E0];
    const paths = chainSearch(q, root.key, root, nodes);

    expect(paths.length).toBeGreaterThanOrEqual(NEXT);
    expect(paths[NONE].parentKey).toBe("dir:/src");
  });
});

describe("chainSearch — two directory children", () => {
  test("includes closer directory in results", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      leaf: [E05, E05],
      childKeys: ["dir:/src/auth", "dir:/src/api"],
      parentKey: null,
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: [E1, E0],
      leaf: [E1, E0],
      childKeys: [],
      parentKey: "dir:/src",
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: [E0, E1],
      leaf: [E0, E1],
      childKeys: [],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, auth, api);
    const q = [E09, E0];
    const paths = chainSearch(q, root.key, root, nodes);
    const authPath = paths.find((p) => p.parentName === "auth");
    const apiPath = paths.find((p) => p.parentName === "api");

    expect(authPath).toBeDefined();
    expect(apiPath).toBeDefined();
    expect(authPath?.confidence).toBeGreaterThan(apiPath?.confidence ?? NONE);
  });

  test("all confidences sum to at most 1", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      leaf: [E05, E05],
      childKeys: ["dir:/src/a", "dir:/src/b"],
      parentKey: null,
    });
    const a = makeDir({
      key: "dir:/src/a",
      name: "a",
      identity: [E1, E0],
      leaf: [E1, E0],
      childKeys: [],
      parentKey: "dir:/src",
    });
    const b = makeDir({
      key: "dir:/src/b",
      name: "b",
      identity: [E0, E1],
      leaf: [E0, E1],
      childKeys: [],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, a, b);
    const q = [E05, E05];
    const paths = chainSearch(q, root.key, root, nodes);
    const totalConf = paths.reduce((s, p) => s + p.confidence, NONE);

    expect(totalConf).toBeLessThanOrEqual(NEXT + EPSILON);
  });
});

describe("chainSearch — nested directories", () => {
  test("explores deeper paths", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      leaf: [E05, E05],
      childKeys: ["dir:/src/a"],
      parentKey: null,
    });
    const a = makeDir({
      key: "dir:/src/a",
      name: "a",
      identity: [E1, E0],
      leaf: [E1, E0],
      childKeys: ["dir:/src/a/deep"],
      parentKey: "dir:/src",
    });
    const deep = makeDir({
      key: "dir:/src/a/deep",
      name: "deep",
      identity: [E09, E0],
      leaf: [E09, E0],
      childKeys: [],
      parentKey: "dir:/src/a",
    });
    const nodes = toNodeMap(root, a, deep);
    const q = [E1, E0];
    const paths = chainSearch(q, root.key, root, nodes);
    const deepPath = paths.find((p) => p.parentName === "deep");

    expect(deepPath).toBeDefined();
    expect(deepPath?.depth).toBeGreaterThan(NONE);
  });

  test("trail entries have node, choice, and probability", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      leaf: [E05, E05],
      childKeys: ["dir:/src/a"],
      parentKey: null,
    });
    const a = makeDir({
      key: "dir:/src/a",
      name: "a",
      identity: [E1, E0],
      leaf: [E1, E0],
      childKeys: [],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, a);
    const q = [E1, E0];
    const paths = chainSearch(q, root.key, root, nodes);
    const nonCreateNew = paths.find(
      (p) => p.trail.length > NONE && !p.trail.some((t) => t.choice === "\u00ABcreate-new\u00BB"),
    );

    expect(nonCreateNew).toBeDefined();
    const entry = nonCreateNew?.trail[NONE];
    expect(entry?.node).toBe("src");
    expect(entry?.choice).toBe("a");
    expect(entry?.probability).toBeGreaterThan(NONE);
  });
});

describe("chainSearch — util filtering", () => {
  test("non-util parent skips util children in routing", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      leaf: [E05, E05],
      childKeys: ["dir:/src/utils", "dir:/src/domain"],
      parentKey: null,
      util: false,
    });
    const utils = makeDir({
      key: "dir:/src/utils",
      name: "utils",
      identity: [E1, E0],
      leaf: [E1, E0],
      childKeys: [],
      parentKey: "dir:/src",
      util: true,
    });
    const domain = makeDir({
      key: "dir:/src/domain",
      name: "domain",
      identity: [E0, E1],
      leaf: [E0, E1],
      childKeys: [],
      parentKey: "dir:/src",
      util: false,
    });
    const nodes = toNodeMap(root, utils, domain);
    const q = [E1, E0];
    const paths = chainSearch(q, root.key, root, nodes);
    const utilPath = paths.find((p) => p.parentName === "utils");

    expect(utilPath).toBeUndefined();
  });
});
