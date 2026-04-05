import {
  E0,
  E005,
  E05,
  E08,
  E09,
  E095,
  E1,
  MIN_GROUP,
  NONE,
  SENSITIVITY,
} from "../../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFormatCtx, toNodeMap } from "../../../../tests/helpers/audits.ts";
import type { NodeMap } from "../../tree/tree.ts";
import { createContext } from "../context.ts";
import weakIdentity from "./weak-identity.ts";

const CONTAINMENT_FLOOR = 0.9;
const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

/** Vectors for weak-identity tests. */
const ID_ROOT = [E05, E05, E0];
const ID_PARENT = [E1, E0, E0];
const ID_UNCLE = [E0, E1, E0];
const ID_DB = [E0, E0, E1];
const LEAF_FITS_UNCLE = [E005, E095, E0];
const LEAF_FITS_PARENT = [E095, E005, E0];
const LEAF_SLIGHT_DRIFT = [E05, E08, E0];

/**
 * Builds a tree with multiple parent directories having measureable
 * drift ratios so the upper fence is finite. Auth has extreme drift
 * (all children fit uncle) while db has moderate drift.
 */
function buildWeakTree(): NodeMap {
  const root = makeDir({
    key: "dir:/src",
    name: "src",
    identity: ID_ROOT,
    leaf: ID_ROOT,
    childKeys: ["dir:/src/auth", "dir:/src/api", "dir:/src/db"],
    parentKey: null,
  });
  const auth = makeDir({
    key: "dir:/src/auth",
    name: "auth",
    identity: ID_PARENT,
    leaf: ID_PARENT,
    childKeys: [],
    parentKey: "dir:/src",
  });
  const api = makeDir({
    key: "dir:/src/api",
    name: "api",
    identity: ID_UNCLE,
    leaf: ID_UNCLE,
    childKeys: [],
    parentKey: "dir:/src",
  });
  const db = makeDir({
    key: "dir:/src/db",
    name: "db",
    identity: ID_DB,
    leaf: ID_DB,
    childKeys: [],
    parentKey: "dir:/src",
  });

  const all = [root, auth, api, db];

  /* auth: 4 children that all drift toward uncle api */
  const authChildKeys: string[] = [];
  const DRIFT_COUNT = 4;
  for (let i = NONE; i < DRIFT_COUNT; i++) {
    const child = makeDir({
      key: `dir:/src/auth/drift${i}`,
      name: `drift${i}`,
      identity: LEAF_FITS_UNCLE,
      leaf: LEAF_FITS_UNCLE,
      parentKey: "dir:/src/auth",
      childKeys: [],
    });
    all.push(child);
    authChildKeys.push(child.key);
  }
  auth.childKeys = authChildKeys;

  /* db: 4 children with only slight drift so fence stays low */
  const dbChildKeys: string[] = [];
  for (let i = NONE; i < DRIFT_COUNT; i++) {
    const child = makeDir({
      key: `dir:/src/db/sub${i}`,
      name: `sub${i}`,
      identity: LEAF_SLIGHT_DRIFT,
      leaf: LEAF_SLIGHT_DRIFT,
      parentKey: "dir:/src/db",
      childKeys: [],
    });
    all.push(child);
    dbChildKeys.push(child.key);
  }
  db.childKeys = dbChildKeys;

  return toNodeMap(...all);
}

describe("weak-identity detect — empty and minimal trees", () => {
  test("returns empty for empty node map", () => {
    const ctx = createContext(toNodeMap(), CONFIG);
    const findings = weakIdentity.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for single directory", () => {
    const root = makeDir({
      key: "dir:/src",
      identity: ID_PARENT,
      parentKey: null,
    });
    const ctx = createContext(toNodeMap(root), CONFIG);
    const findings = weakIdentity.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("weak-identity detect — drift detection", () => {
  test("flags parent when majority of children drift to uncle", () => {
    const nodes = buildWeakTree();
    const ctx = createContext(nodes, CONFIG);
    const findings = weakIdentity.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).toContain("dir:/src/auth");
  });

  test("does not flag when children fit parent well", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      leaf: ID_ROOT,
      childKeys: ["dir:/src/auth", "dir:/src/api"],
      parentKey: null,
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: ID_PARENT,
      leaf: ID_PARENT,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: ID_UNCLE,
      leaf: ID_UNCLE,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const childKeys: string[] = [];
    const all = [root, auth, api];
    const GOOD_COUNT = 4;
    for (let i = NONE; i < GOOD_COUNT; i++) {
      const child = makeDir({
        key: `dir:/src/auth/good${i}`,
        name: `good${i}`,
        identity: LEAF_FITS_PARENT,
        leaf: LEAF_FITS_PARENT,
        parentKey: "dir:/src/auth",
        childKeys: [],
      });
      all.push(child);
      childKeys.push(child.key);
    }
    auth.childKeys = childKeys;
    const nodes = toNodeMap(...all);
    const ctx = createContext(nodes, CONFIG);
    const findings = weakIdentity.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("dir:/src/auth");
  });
});

describe("weak-identity detect — missing ancestry", () => {
  test("skips when grandparent is missing from map", () => {
    const orphan = makeDir({
      key: "dir:/src/orphan",
      name: "orphan",
      identity: ID_PARENT,
      leaf: ID_PARENT,
      childKeys: [],
      parentKey: "dir:/src/gone",
    });
    const ctx = createContext(toNodeMap(orphan), CONFIG);
    const findings = weakIdentity.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("skips when parent has no uncle directories", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      leaf: ID_ROOT,
      childKeys: ["dir:/src/only"],
      parentKey: null,
    });
    const only = makeDir({
      key: "dir:/src/only",
      name: "only",
      identity: ID_PARENT,
      leaf: ID_PARENT,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const ctx = createContext(toNodeMap(root, only), CONFIG);
    const findings = weakIdentity.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("weak-identity detect — skips", () => {
  test("skips util directories", () => {
    const nodes = buildWeakTree();
    const auth = nodes.get("dir:/src/auth");
    if (auth) {
      (auth as { util: boolean }).util = true;
    }
    const ctx = createContext(nodes, CONFIG);
    const findings = weakIdentity.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("dir:/src/auth");
  });

  test("skips leaf nodes", () => {
    const nodes = buildWeakTree();
    const ctx = createContext(nodes, CONFIG);
    const findings = weakIdentity.detect(ctx);

    for (const f of findings) {
      const node = nodes.get(f.key);
      expect(node?.kind).not.toBe("function");
      expect(node?.kind).not.toBe("type");
    }
  });
});

describe("weak-identity detect — suppression", () => {
  test("respects @kuralResidual suppression", () => {
    const nodes = buildWeakTree();
    const auth = nodes.get("dir:/src/auth");
    if (auth) {
      auth.residuals = [{ audit: "weak-identity" }];
    }
    const ctx = createContext(nodes, CONFIG);
    const findings = weakIdentity.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("dir:/src/auth");
  });
});

describe("weak-identity detect — finding details", () => {
  test("includes driftCount and childCount in details", () => {
    const nodes = buildWeakTree();
    const ctx = createContext(nodes, CONFIG);
    const findings = weakIdentity.detect(ctx);
    const authFinding = findings.find((f) => f.key === "dir:/src/auth");

    if (authFinding !== undefined) {
      expect(authFinding.details).toBeDefined();
      expect(typeof authFinding.details?.driftCount).toBe("number");
      expect(typeof authFinding.details?.childCount).toBe("number");
    }
  });

  test("pairKey is the worst uncle name", () => {
    const nodes = buildWeakTree();
    const ctx = createContext(nodes, CONFIG);
    const findings = weakIdentity.detect(ctx);
    const authFinding = findings.find((f) => f.key === "dir:/src/auth");

    if (authFinding !== undefined) {
      expect(authFinding.pairKey).toBe("api");
    }
  });
});

describe("weak-identity format", () => {
  test("heading includes drift count", () => {
    const DRIFT = 3;
    const CHILDREN = 5;
    const fctx = makeFormatCtx({
      finding: {
        audit: "weak-identity",
        key: "dir:/src/auth",
        name: "auth",
        hash: "abcd1234",
        pairKey: "api",
        value: E05,
        groupValue: E08,
        details: { driftCount: DRIFT, childCount: CHILDREN },
      },
      prefix: "\u25B8",
      label: "auth",
    });
    const result = weakIdentity.format(fctx);

    expect(result.heading).toContain("weak identity");
    expect(result.heading).toContain(`${DRIFT}/${CHILDREN}`);
  });

  test("details mention parent fit and uncle", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "weak-identity",
        key: "dir:/src/auth",
        name: "auth",
        hash: "abcd1234",
        pairKey: "api",
        value: E05,
        groupValue: E09,
        details: { driftCount: 2, childCount: 4 },
      },
      prefix: "\u25B8",
      label: "auth",
    });
    const result = weakIdentity.format(fctx);

    expect(result.details[NONE]).toContain("api");
    expect(result.details[NONE]).toContain("90%");
  });
});
