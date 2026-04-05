import { bestLeafMatch, classifyAxis } from "./calibrate.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";

const NONE = 0;
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
