import { describe, expect, test } from "vite-plus/test";
import { findCapabilityRoot, findRoot, vecOf } from "./helpers.ts";
import { makeDir, toNodeMap } from "../../../tests/helpers/audits.ts";

const NONE = 0;
const E0 = 0.0;
const E075 = 0.75;
const E025 = 0.25;
const E1 = 1.0;

describe("vecOf — blended vector computation", () => {
  test("returns identity when leaf is empty", () => {
    const node = makeDir({ identity: [E1, E0], leaf: [] });
    const result = vecOf(node);

    expect(result).toEqual([E1, E0]);
  });

  test("blends 75% leaf + 25% identity", () => {
    const node = makeDir({ identity: [E1, E0], leaf: [E0, E1] });
    const result = vecOf(node);

    expect(result[NONE]).toBeCloseTo(E025);
    const SECOND = 1;
    expect(result[SECOND]).toBeCloseTo(E075);
  });
});

describe("findRoot — tree root detection", () => {
  test("finds the root directory with null parentKey", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      parentKey: null,
    });
    const child = makeDir({
      key: "dir:/src/sub",
      name: "sub",
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, child);
    const result = findRoot(nodes);

    expect(result.key).toBe("dir:/src");
    expect(result.node.name).toBe("src");
  });

  test("throws when no root directory exists", () => {
    const child = makeDir({
      key: "dir:/src/sub",
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(child);

    expect(() => findRoot(nodes)).toThrow("No root directory");
  });
});

describe("findCapabilityRoot — util root detection", () => {
  test("returns null when no util directories exist", () => {
    const root = makeDir({
      key: "dir:/src",
      parentKey: null,
      childKeys: ["dir:/src/domain"],
    });
    const domain = makeDir({
      key: "dir:/src/domain",
      parentKey: "dir:/src",
      util: false,
    });
    const nodes = toNodeMap(root, domain);
    const result = findCapabilityRoot({ key: root.key, node: root }, nodes);

    expect(result).toBeNull();
  });

  test("returns the first util directory key", () => {
    const root = makeDir({
      key: "dir:/src",
      parentKey: null,
      childKeys: ["dir:/src/utils", "dir:/src/domain"],
    });
    const utils = makeDir({
      key: "dir:/src/utils",
      parentKey: "dir:/src",
      util: true,
    });
    const domain = makeDir({
      key: "dir:/src/domain",
      parentKey: "dir:/src",
      util: false,
    });
    const nodes = toNodeMap(root, utils, domain);
    const result = findCapabilityRoot({ key: root.key, node: root }, nodes);

    expect(result).toBe("dir:/src/utils");
  });
});
