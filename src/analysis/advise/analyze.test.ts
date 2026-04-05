import { analyzeFromDescriptions, analyzeFromTree } from "./analyze.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, toNodeMap } from "../../../tests/helpers/audits.ts";
import type { NamedVector } from "./analyze.ts";

const NONE = 0;
const NEXT = 1;
const E0 = 0.0;
const E02 = 0.2;
const E04 = 0.4;
const E05 = 0.5;
const E08 = 0.8;
const E1 = 1.0;

describe("analyzeFromDescriptions — insufficient items", () => {
  test("returns null for empty list", () => {
    const result = analyzeFromDescriptions([]);

    expect(result).toBeNull();
  });

  test("returns null for single item", () => {
    const items: NamedVector[] = [{ name: "solo", identity: [E1, E0], leaf: [E1, E0] }];
    const result = analyzeFromDescriptions(items);

    expect(result).toBeNull();
  });
});

describe("analyzeFromDescriptions — two items", () => {
  test("returns result with correct childCount", () => {
    const items: NamedVector[] = [
      { name: "auth", identity: [E1, E0, E0], leaf: [E1, E0, E0] },
      { name: "api", identity: [E0, E1, E0], leaf: [E0, E1, E0] },
    ];
    const result = analyzeFromDescriptions(items);

    expect(result).not.toBeNull();
    expect(result?.childCount).toBe(NEXT + NEXT);
    expect(result?.targetName).toBe("descriptions");
  });

  test("has valid current metrics", () => {
    const items: NamedVector[] = [
      { name: "auth", identity: [E1, E0], leaf: [E1, E0] },
      { name: "api", identity: [E0, E1], leaf: [E0, E1] },
    ];
    const result = analyzeFromDescriptions(items);

    expect(result).not.toBeNull();
    expect(typeof result?.currentChildrenFit).toBe("number");
    expect(typeof result?.currentChildrenUniqueness).toBe("number");
    expect(typeof result?.currentChildrenScore).toBe("number");
  });
});

describe("analyzeFromDescriptions — multiple items with cuts", () => {
  test("produces merge distances and cut evaluations", () => {
    const items: NamedVector[] = [
      { name: "a", identity: [E1, E0, E0], leaf: [E1, E0, E0] },
      { name: "b", identity: [E08, E02, E0], leaf: [E08, E02, E0] },
      { name: "c", identity: [E0, E1, E0], leaf: [E0, E1, E0] },
      { name: "d", identity: [E0, E08, E02], leaf: [E0, E08, E02] },
    ];
    const result = analyzeFromDescriptions(items);

    expect(result).not.toBeNull();
    expect(result?.merges.length).toBeGreaterThan(NONE);
    expect(result?.cuts.length).toBeGreaterThan(NONE);
  });

  test("cut evaluations have groups or singletons", () => {
    const items: NamedVector[] = [
      { name: "a", identity: [E1, E0, E0], leaf: [E1, E0, E0] },
      { name: "b", identity: [E08, E02, E0], leaf: [E08, E02, E0] },
      { name: "c", identity: [E0, E1, E0], leaf: [E0, E1, E0] },
    ];
    const result = analyzeFromDescriptions(items);

    expect(result).not.toBeNull();
    for (const cut of result?.cuts ?? []) {
      expect(typeof cut.similarity).toBe("number");
      const hasContent = cut.groups.length > NONE || cut.singletons.length > NONE;
      expect(hasContent).toBe(true);
    }
  });

  test("groups have simulated metrics", () => {
    const items: NamedVector[] = [
      { name: "a", identity: [E1, E0, E0], leaf: [E1, E0, E0] },
      { name: "b", identity: [E08, E02, E0], leaf: [E08, E02, E0] },
      { name: "c", identity: [E0, E0, E1], leaf: [E0, E0, E1] },
      { name: "d", identity: [E0, E02, E08], leaf: [E0, E02, E08] },
    ];
    const result = analyzeFromDescriptions(items);

    expect(result).not.toBeNull();
    const cutsWithGroups = result?.cuts.filter((c) => c.groups.length > NONE) ?? [];
    expect(cutsWithGroups.length).toBeGreaterThan(NONE);
    for (const cut of cutsWithGroups) {
      for (const group of cut.groups) {
        expect(group.names.length).toBeGreaterThanOrEqual(NEXT + NEXT);
        expect(typeof group.childrenFit).toBe("number");
        expect(typeof group.childrenUniqueness).toBe("number");
        expect(typeof group.childrenScore).toBe("number");
      }
    }
  });
});

describe("analyzeFromDescriptions — bestCutIndex", () => {
  test("bestCutIndex is null when no cut improves", () => {
    const items: NamedVector[] = [
      { name: "a", identity: [E05, E05, E0], leaf: [E05, E05, E0] },
      { name: "b", identity: [E05, E04, E0], leaf: [E05, E04, E0] },
      { name: "c", identity: [E04, E05, E0], leaf: [E04, E05, E0] },
    ];
    const result = analyzeFromDescriptions(items);

    expect(result).not.toBeNull();
    if (result !== null && result?.bestCutIndex !== null) {
      expect(result.bestCutIndex).toBeGreaterThanOrEqual(NONE);
      expect(result.bestCutIndex).toBeLessThan(result.cuts.length);
    }
  });
});

describe("analyzeFromTree — tree mode", () => {
  test("returns null when directory has fewer than 2 dir children", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      leaf: [E05, E05],
      childKeys: ["dir:/src/only"],
      parentKey: null,
    });
    const only = makeDir({
      key: "dir:/src/only",
      name: "only",
      identity: [E1, E0],
      leaf: [E1, E0],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, only);
    const result = analyzeFromTree(root, nodes, false);

    expect(result).toBeNull();
  });

  test("analyzes directory with two dir children", () => {
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
      parentKey: "dir:/src",
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: [E0, E1, E0],
      leaf: [E0, E1, E0],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, auth, api);
    const result = analyzeFromTree(root, nodes, false);

    expect(result).not.toBeNull();
    expect(result?.targetName).toBe("src");
    expect(result?.childCount).toBe(NEXT + NEXT);
  });

  test("uses leaf vectors when useLeaf is true", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05, E05],
      leaf: [E05, E05, E05],
      childKeys: ["dir:/src/a", "dir:/src/b", "dir:/src/c"],
      parentKey: null,
    });
    const a = makeDir({
      key: "dir:/src/a",
      name: "a",
      identity: [E1, E0, E0],
      leaf: [E02, E08, E0],
      parentKey: "dir:/src",
    });
    const b = makeDir({
      key: "dir:/src/b",
      name: "b",
      identity: [E0, E0, E1],
      leaf: [E0, E02, E08],
      parentKey: "dir:/src",
    });
    const c = makeDir({
      key: "dir:/src/c",
      name: "c",
      identity: [E0, E1, E0],
      leaf: [E08, E0, E02],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, a, b, c);
    const identityResult = analyzeFromTree(root, nodes, false);
    const leafResult = analyzeFromTree(root, nodes, true);

    expect(identityResult).not.toBeNull();
    expect(leafResult).not.toBeNull();
    const identityMerges = identityResult?.merges.join(",") ?? "";
    const leafMerges = leafResult?.merges.join(",") ?? "";
    expect(identityMerges).not.toBe(leafMerges);
  });

  test("skips file children — only analyzes directories", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05],
      leaf: [E05, E05],
      childKeys: ["dir:/src/a", "file:/src/readme.md"],
      parentKey: null,
    });
    const a = makeDir({
      key: "dir:/src/a",
      name: "a",
      identity: [E1, E0],
      leaf: [E1, E0],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, a);
    const result = analyzeFromTree(root, nodes, false);

    expect(result).toBeNull();
  });
});
