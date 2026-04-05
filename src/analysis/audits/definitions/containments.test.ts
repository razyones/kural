import {
  CONTAINMENT_FLOOR,
  E0,
  E001,
  E01,
  E045,
  E048,
  E05,
  E052,
  E09,
  E095,
  E099,
  E1,
  MIN_GROUP,
  NONE,
  SENSITIVITY,
} from "../../../../tests/constants/audits.ts";
import type { CodeNode, NodeMap } from "../../tree/tree.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  makeFile,
  makeFormatCtx,
  makeFunction,
  makeType,
  toNodeMap,
} from "../../../../tests/helpers/audits.ts";
import containments from "./containments.ts";
import { createContext } from "../context.ts";

const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

/** Embeddings: dominant child nearly identical to parent, others distant. */
const PARENT_EMB = [E1, E0, E0];
const DOMINANT_EMB = [E099, E001, E0];
const WEAK_A = [E0, E1, E0];
const WEAK_B = [E0, E0, E1];
const WEAK_C = [E01, E09, E0];
const BAL_LEAF = [E05, E05, E0];
const BAL_LEAF_B = [E048, E052, E0];

/** Creates a balanced file (low dominance gap) with 2 children. */
function makeBalancedFile(idx: number): CodeNode[] {
  const fnA = makeFunction({
    key: `func:/src/b${idx}.ts:a${idx}`,
    name: `a${idx}`,
    leaf: BAL_LEAF,
    parentKey: `file:/src/b${idx}.ts`,
  });
  const fnB = makeFunction({
    key: `func:/src/b${idx}.ts:b${idx}`,
    name: `b${idx}`,
    leaf: BAL_LEAF_B,
    parentKey: `file:/src/b${idx}.ts`,
  });
  const file = makeFile({
    key: `file:/src/b${idx}.ts`,
    name: `b${idx}.ts`,
    leaf: BAL_LEAF,
    childKeys: [fnA.key, fnB.key],
  });
  return [file, fnA, fnB];
}

/** Creates the dominated file node with its children. */
function makeDominatedFile(): CodeNode[] {
  const dom = makeFunction({
    key: "func:/src/dom.ts:dom",
    name: "dom",
    leaf: DOMINANT_EMB,
    parentKey: "file:/src/dom.ts",
  });
  const wA = makeFunction({
    key: "func:/src/dom.ts:wA",
    name: "wA",
    leaf: WEAK_A,
    parentKey: "file:/src/dom.ts",
  });
  const wB = makeFunction({
    key: "func:/src/dom.ts:wB",
    name: "wB",
    leaf: WEAK_B,
    parentKey: "file:/src/dom.ts",
  });
  const wC = makeFunction({
    key: "func:/src/dom.ts:wC",
    name: "wC",
    leaf: WEAK_C,
    parentKey: "file:/src/dom.ts",
  });
  const file = makeFile({
    key: "file:/src/dom.ts",
    name: "dom.ts",
    leaf: PARENT_EMB,
    childKeys: [dom.key, wA.key, wB.key, wC.key],
  });
  return [file, dom, wA, wB, wC];
}

const BALANCED_COUNT = 8;

/** Builds a tree with 1 dominated file and many balanced files. */
function buildDominanceTree(): NodeMap {
  const all: CodeNode[] = [...makeDominatedFile()];
  for (let i = NONE; i < BALANCED_COUNT; i++) {
    all.push(...makeBalancedFile(i));
  }
  return toNodeMap(...all);
}

describe("containments detect — empty and insufficient", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for file with single child", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:fn",
      name: "fn",
      leaf: DOMINANT_EMB,
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [fn.key],
    });
    fn.parentKey = file.key;
    const nodes = toNodeMap(file, fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("containments detect — dominant child pattern", () => {
  test("flags parent dominated by one child", () => {
    const nodes = buildDominanceTree();
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).toContain("file:/src/dom.ts");
  });
});

describe("containments detect — uniform children", () => {
  test("does not flag parent with uniform children", () => {
    const all: CodeNode[] = [];
    for (let i = NONE; i < BALANCED_COUNT; i++) {
      all.push(...makeBalancedFile(i));
    }
    const nodes = toNodeMap(...all);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("containments detect — suppression", () => {
  test("respects suppression on parent", () => {
    const nodes = buildDominanceTree();
    const domFile = nodes.get("file:/src/dom.ts");
    if (domFile) {
      domFile.residuals = [{ audit: "containments" }];
    }
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("file:/src/dom.ts");
  });
});

describe("containments detect — skips util and empty", () => {
  test("skips util parents", () => {
    const dom = makeFunction({
      key: "func:/src/u.ts:dom",
      name: "dom",
      leaf: DOMINANT_EMB,
    });
    const weak = makeFunction({
      key: "func:/src/u.ts:w",
      name: "w",
      leaf: WEAK_A,
    });
    const file = makeFile({
      key: "file:/src/u.ts",
      leaf: PARENT_EMB,
      childKeys: [dom.key, weak.key],
      util: true,
    });
    dom.parentKey = file.key;
    weak.parentKey = file.key;
    const nodes = toNodeMap(file, dom, weak);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips parents with empty leaf", () => {
    const dom = makeFunction({
      key: "func:/src/a.ts:dom",
      name: "dom",
      leaf: DOMINANT_EMB,
    });
    const weak = makeFunction({
      key: "func:/src/a.ts:w",
      name: "w",
      leaf: WEAK_A,
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: [],
      childKeys: [dom.key, weak.key],
    });
    dom.parentKey = file.key;
    weak.parentKey = file.key;
    const nodes = toNodeMap(file, dom, weak);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("containments detect — children with empty leaf", () => {
  test("skips children with empty leaf embeddings", () => {
    const dom = makeFunction({
      key: "func:/src/a.ts:dom",
      name: "dom",
      leaf: DOMINANT_EMB,
    });
    const empty = makeFunction({
      key: "func:/src/a.ts:empty",
      name: "empty",
      leaf: [],
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      leaf: PARENT_EMB,
      childKeys: [dom.key, empty.key],
    });
    dom.parentKey = file.key;
    empty.parentKey = file.key;
    const nodes = toNodeMap(file, dom, empty);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("containments detect — type-producer pair filtering", () => {
  test("skips parent when all non-dominant are type-producer pairs", () => {
    const tyNode = makeType({
      key: "type:/src/tp.ts:Config",
      name: "Config",
      leaf: DOMINANT_EMB,
      parentKey: "file:/src/tp.ts",
    });
    const fnNode = makeFunction({
      key: "func:/src/tp.ts:getConfig",
      name: "getConfig",
      leaf: WEAK_A,
      parentKey: "file:/src/tp.ts",
      returnsType: "Config",
    });
    const file = makeFile({
      key: "file:/src/tp.ts",
      name: "tp.ts",
      leaf: PARENT_EMB,
      childKeys: [tyNode.key, fnNode.key],
    });
    const nodes = toNodeMap(file, tyNode, fnNode);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(file.key);
  });
});

describe("containments detect — outward-bound suppression", () => {
  test("suppresses containment when dominant child is outward-bound", () => {
    const dom = makeFunction({
      key: "func:/src/dom.ts:dom",
      name: "dom",
      leaf: DOMINANT_EMB,
      parentKey: "file:/src/dom.ts",
      bound: "outward",
    });
    const wA = makeFunction({
      key: "func:/src/dom.ts:wA",
      name: "wA",
      leaf: WEAK_A,
      parentKey: "file:/src/dom.ts",
    });
    const wB = makeFunction({
      key: "func:/src/dom.ts:wB",
      name: "wB",
      leaf: WEAK_B,
      parentKey: "file:/src/dom.ts",
    });
    const wC = makeFunction({
      key: "func:/src/dom.ts:wC",
      name: "wC",
      leaf: WEAK_C,
      parentKey: "file:/src/dom.ts",
    });
    const file = makeFile({
      key: "file:/src/dom.ts",
      name: "dom.ts",
      leaf: PARENT_EMB,
      childKeys: [dom.key, wA.key, wB.key, wC.key],
    });
    const all: CodeNode[] = [file, dom, wA, wB, wC];
    for (let i = NONE; i < BALANCED_COUNT; i++) {
      all.push(...makeBalancedFile(i));
    }
    const nodes = toNodeMap(...all);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("file:/src/dom.ts");
  });

  test("does NOT suppress when dominant child is not outward-bound", () => {
    const nodes = buildDominanceTree();
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).toContain("file:/src/dom.ts");
  });
});

describe("containments detect — gap below fence", () => {
  test("does not flag when gap is below fence", () => {
    const all: CodeNode[] = [];
    for (let i = NONE; i < BALANCED_COUNT; i++) {
      all.push(...makeBalancedFile(i));
    }
    const nodes = toNodeMap(...all);
    const ctx = createContext(nodes, CONFIG);
    const findings = containments.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("containments format", () => {
  test("includes dominant name and sim info", () => {
    const GAP_VALUE = E05;
    const DOM_SIM = E095;
    const SECOND_SIM = E045;
    const CHILD_COUNT = 4;
    const fctx = makeFormatCtx({
      finding: {
        audit: "containments",
        key: "file:/src/a.ts",
        name: "a.ts",
        hash: "abcd1234",
        value: GAP_VALUE,
        details: {
          dominantName: "bigChild",
          dominantSim: DOM_SIM,
          secondSim: SECOND_SIM,
          childCount: CHILD_COUNT,
        },
      },
      prefix: "\u25B8",
      label: "a.ts",
    });
    const result = containments.format(fctx);

    expect(result.heading).toContain("dominated by");
    expect(result.heading).toContain("bigChild");
    expect(result.details[NONE]).toContain("Dominant:");
    expect(result.details[NONE]).toContain("95%");
    expect(result.details[NONE]).toContain("4 children");
  });
});
