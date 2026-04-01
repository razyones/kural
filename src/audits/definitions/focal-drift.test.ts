import {
  CONTAINMENT_FLOOR,
  E0,
  E001,
  E01,
  E09,
  E099,
  E1,
  MIN_GROUP,
  NONE,
  ONE,
  SENSITIVITY,
} from "../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeFile, makeFormatCtx, makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import focalDrift from "./focal-drift.ts";

const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

const PARENT_EMB = [E1, E0, E0];
const FOCAL_EMB = [E099, E001, E0];
const OVERTAKER_EMB = [E1, E0, E0];
const WEAK_EMB = [E0, E1, E0];

describe("focal-drift detect — no drift", () => {
  test("returns empty when outward node is still dominant", () => {
    const focal = makeFunction({
      key: "func:/src/a.ts:focal",
      name: "focal",
      leaf: FOCAL_EMB,
      parentKey: "file:/src/a.ts",
      bound: "outward",
    });
    const helper = makeFunction({
      key: "func:/src/a.ts:helper",
      name: "helper",
      leaf: WEAK_EMB,
      parentKey: "file:/src/a.ts",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [focal.key, helper.key],
    });
    const nodes = toNodeMap(file, focal, helper);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("focal-drift detect — drift detected", () => {
  test("flags outward node when another child is more similar to parent", () => {
    const focal = makeFunction({
      key: "func:/src/a.ts:focal",
      name: "focal",
      leaf: WEAK_EMB,
      parentKey: "file:/src/a.ts",
      bound: "outward",
    });
    const overtaker = makeFunction({
      key: "func:/src/a.ts:overtaker",
      name: "overtaker",
      leaf: OVERTAKER_EMB,
      parentKey: "file:/src/a.ts",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [focal.key, overtaker.key],
    });
    const nodes = toNodeMap(file, focal, overtaker);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(ONE);
    expect(findings[NONE].key).toBe(focal.key);
    expect(findings[NONE].details?.["actualTopName"]).toBe("overtaker");
  });
});

describe("focal-drift detect — skips non-outward", () => {
  test("ignores nodes without outward bound", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:fn",
      name: "fn",
      leaf: WEAK_EMB,
      parentKey: "file:/src/a.ts",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [fn.key],
    });
    const nodes = toNodeMap(file, fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("ignores inward-bound nodes", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:fn",
      name: "fn",
      leaf: WEAK_EMB,
      parentKey: "file:/src/a.ts",
      bound: "inward",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [fn.key],
    });
    const nodes = toNodeMap(file, fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("focal-drift detect — edge cases", () => {
  test("skips outward node with no parent key", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:fn",
      name: "fn",
      leaf: FOCAL_EMB,
      parentKey: null,
      bound: "outward",
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips when parent is missing from the map", () => {
    const focal = makeFunction({
      key: "func:/src/a.ts:focal",
      name: "focal",
      leaf: FOCAL_EMB,
      parentKey: "file:/src/missing.ts",
      bound: "outward",
    });
    const nodes = toNodeMap(focal);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips when all children have empty leaves", () => {
    const focal = makeFunction({
      key: "func:/src/a.ts:focal",
      name: "focal",
      leaf: [],
      parentKey: "file:/src/a.ts",
      bound: "outward",
    });
    const helper = makeFunction({
      key: "func:/src/a.ts:helper",
      name: "helper",
      leaf: [],
      parentKey: "file:/src/a.ts",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [focal.key, helper.key],
    });
    const nodes = toNodeMap(file, focal, helper);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("handles multiple outward nodes under the same parent", () => {
    const focalA = makeFunction({
      key: "func:/src/a.ts:focalA",
      name: "focalA",
      leaf: WEAK_EMB,
      parentKey: "file:/src/a.ts",
      bound: "outward",
    });
    const focalB = makeFunction({
      key: "func:/src/a.ts:focalB",
      name: "focalB",
      leaf: OVERTAKER_EMB,
      parentKey: "file:/src/a.ts",
      bound: "outward",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [focalA.key, focalB.key],
    });
    const nodes = toNodeMap(file, focalA, focalB);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    // focalA drifted (focalB is closer to parent), focalB did not
    expect(findings.length).toBe(ONE);
    expect(findings[NONE].key).toBe(focalA.key);
  });

  test("skips outward node filtered from eligible sims (e.g. helper)", () => {
    const focal = makeFunction({
      key: "func:/src/a.ts:focal",
      name: "focal",
      leaf: FOCAL_EMB,
      parentKey: "file:/src/a.ts",
      bound: "outward",
      helper: true,
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [focal.key],
    });
    const nodes = toNodeMap(file, focal);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips when parent has empty leaf", () => {
    const focal = makeFunction({
      key: "func:/src/a.ts:focal",
      name: "focal",
      leaf: FOCAL_EMB,
      parentKey: "file:/src/a.ts",
      bound: "outward",
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: [],
      childKeys: [focal.key],
    });
    const nodes = toNodeMap(file, focal);
    const ctx = createContext(nodes, CONFIG);
    const findings = focalDrift.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("focal-drift format", () => {
  test("includes overtaker name and similarity values", () => {
    const TOP_SIM = E09;
    const SELF_SIM = E01;
    const fctx = makeFormatCtx({
      finding: {
        audit: "focal-drift",
        key: "func:/src/a.ts:focal",
        name: "focal",
        hash: "abcd1234",
        details: {
          actualTopName: "overtaker",
          topSim: TOP_SIM,
          selfSim: SELF_SIM,
        },
      },
      prefix: "\u25B8",
      label: "focal",
      location: " in a.ts",
    });
    const result = focalDrift.format(fctx);

    expect(result.heading).toContain("no longer the dominant child");
    expect(result.details[NONE]).toContain("overtaker");
    expect(result.details[NONE]).toContain("90%");
  });
});
