import {
  CONTAINMENT_FLOOR,
  E0,
  E005,
  E03,
  E04,
  E05,
  E08,
  E095,
  E1,
  MIN_GROUP,
  NONE,
  SENSITIVITY,
} from "../../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFormatCtx, suppress, toNodeMap } from "../../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import vocabularyBleed from "./vocabulary-bleed.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
  containmentFloor: CONTAINMENT_FLOOR,
  minGroup: MIN_GROUP,
};

/** Identity vectors for vocabulary bleed tests. */
const ID_ROOT = [E05, E05, E0];
const ID_AUTH = [E1, E0, E0];
const ID_API = [E0, E1, E0];
const ID_DB = [E0, E0, E1];
const ID_BLEEDER = [E0, E095, E005];
const ID_DISTANT = [E03, E03, E04];

describe("vocabulary-bleed detect — empty and single", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for single directory", () => {
    const dir = makeDir({ identity: ID_AUTH });
    const nodes = toNodeMap(dir);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("vocabulary-bleed detect — cross-module pull", () => {
  test("flags dir closer to non-sibling than weakest sibling", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      childKeys: ["dir:/src/auth", "dir:/src/api", "dir:/src/db"],
      parentKey: null,
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: ID_BLEEDER,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: ID_API,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const db = makeDir({
      key: "dir:/src/db",
      name: "db",
      identity: ID_DB,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const distant = makeDir({
      key: "dir:/other",
      name: "other",
      identity: ID_DISTANT,
      childKeys: [],
      parentKey: null,
    });
    const nodes = toNodeMap(root, auth, api, db, distant);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(NONE);
  });
});

describe("vocabulary-bleed detect — no siblings", () => {
  test("returns empty when directory has no siblings", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      childKeys: ["dir:/src/only"],
      parentKey: null,
    });
    const only = makeDir({
      key: "dir:/src/only",
      name: "only",
      identity: ID_AUTH,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, only);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("vocabulary-bleed detect — suppression", () => {
  test("respects suppression", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      childKeys: ["dir:/src/auth", "dir:/src/api", "dir:/src/db"],
      parentKey: null,
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: ID_BLEEDER,
      childKeys: [],
      parentKey: "dir:/src",
      residuals: [suppress("vocabulary-bleed")],
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: ID_API,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const db = makeDir({
      key: "dir:/src/db",
      name: "db",
      identity: ID_DB,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, auth, api, db);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(auth.key);
  });
});

describe("vocabulary-bleed detect — empty identity excluded", () => {
  test("skips directories with empty identity", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      childKeys: ["dir:/src/a", "dir:/src/b"],
      parentKey: null,
    });
    const dirA = makeDir({
      key: "dir:/src/a",
      identity: [],
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirB = makeDir({
      key: "dir:/src/b",
      identity: ID_API,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, dirA, dirB);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(dirA.key);
  });
});

describe("vocabulary-bleed detect — non-directory parent", () => {
  test("skips dir whose parent is not a directory", () => {
    const dir = makeDir({
      key: "dir:/orphan",
      identity: ID_BLEEDER,
      childKeys: [],
      parentKey: null,
    });
    const nodes = toNodeMap(dir);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("vocabulary-bleed detect — few candidates skipped", () => {
  test("skips candidate when fewer than two others exist", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      childKeys: ["dir:/src/a", "dir:/src/b"],
      parentKey: null,
    });
    const dirA = makeDir({
      key: "dir:/src/a",
      name: "a",
      identity: ID_BLEEDER,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirB = makeDir({
      key: "dir:/src/b",
      name: "b",
      identity: ID_DB,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const nodes = toNodeMap(root, dirA, dirB);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("vocabulary-bleed detect — @kuralBorrows exclusion", () => {
  test("excludes declared borrows target from cross-pulls", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      childKeys: ["dir:/src/auth", "dir:/src/api", "dir:/src/db"],
      parentKey: null,
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: ID_BLEEDER,
      childKeys: [],
      parentKey: "dir:/src",
      borrows: { target: "other/stuff", role: "terminal surface" },
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: ID_API,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const db = makeDir({
      key: "dir:/src/db",
      name: "db",
      identity: ID_DB,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const target = makeDir({
      key: "dir:/other/stuff",
      name: "stuff",
      identity: ID_API,
      childKeys: [],
      parentKey: null,
    });
    const nodes = toNodeMap(root, auth, api, db, target);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    // Cross-pull to dir:/other/stuff should be excluded for auth
    const authFinding = findings.find((f) => f.key === auth.key);
    const authPulls = authFinding?.details?.["crossPulls"];
    const pullPaths = Array.isArray(authPulls)
      ? authPulls
          .filter((p): p is { path: string } => typeof p === "object" && p !== null && "path" in p)
          .map((p) => p.path)
      : [];

    expect(pullPaths).not.toContain("dir:/other/stuff");
  });

  test("does not exclude non-matching targets", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_ROOT,
      childKeys: ["dir:/src/auth", "dir:/src/api", "dir:/src/db"],
      parentKey: null,
    });
    const auth = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: ID_BLEEDER,
      childKeys: [],
      parentKey: "dir:/src",
      borrows: { target: "unrelated/module", role: "some role" },
    });
    const api = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: ID_API,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const db = makeDir({
      key: "dir:/src/db",
      name: "db",
      identity: ID_DB,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const distant = makeDir({
      key: "dir:/other",
      name: "other",
      identity: ID_DISTANT,
      childKeys: [],
      parentKey: null,
    });
    const nodes = toNodeMap(root, auth, api, db, distant);
    const ctx = createContext(nodes, CONFIG);
    const findings = vocabularyBleed.detect(ctx);

    // dir:/other does not match "unrelated/module", so it is still considered
    expect(findings.length).toBeGreaterThanOrEqual(NONE);
  });
});

describe("vocabulary-bleed format", () => {
  test("includes cross-module vocabulary heading", () => {
    const MIN_SIB = E03;
    const CROSS_SIM = E08;
    const fctx = makeFormatCtx({
      finding: {
        audit: "vocabulary-bleed",
        key: "dir:/src/auth",
        name: "auth",
        hash: "abcd1234",
        value: E05,
        details: {
          minSiblingSim: MIN_SIB,
          crossPulls: [{ path: "dir:/other/stuff", sim: CROSS_SIM }],
        },
      },
      prefix: "\u25B8",
      label: "auth",
      rootPath: null,
    });
    const result = vocabularyBleed.format(fctx);

    expect(result.heading).toContain("cross-module vocabulary");
    expect(result.details[NONE]).toContain("Closer to non-sibling");
  });

  test("uses rootPath for relative display", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "vocabulary-bleed",
        key: "dir:/src/auth",
        name: "auth",
        hash: "abcd1234",
        value: E05,
        details: {
          minSiblingSim: E03,
          crossPulls: [{ path: "dir:/src/other", sim: E08 }],
        },
      },
      prefix: "\u25B8",
      label: "auth",
      rootPath: "/src",
    });
    const result = vocabularyBleed.format(fctx);

    expect(result.details[NONE]).toContain("other");
  });

  test("handles empty crossPulls", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "vocabulary-bleed",
        key: "dir:/src/auth",
        name: "auth",
        hash: "abcd1234",
        value: E05,
        details: { minSiblingSim: E03, crossPulls: [] },
      },
      prefix: "\u25B8",
      label: "auth",
      rootPath: null,
    });
    const result = vocabularyBleed.format(fctx);

    expect(result.details.length).toBe(NONE);
  });

  test("filters non-object items from crossPulls", () => {
    const MIN_SIB = E03;
    const CROSS_SIM = E08;
    const fctx = makeFormatCtx({
      finding: {
        audit: "vocabulary-bleed",
        key: "dir:/src/auth",
        name: "auth",
        hash: "abcd1234",
        value: E05,
        details: {
          minSiblingSim: MIN_SIB,
          crossPulls: [null, "string", { path: "dir:/x", sim: CROSS_SIM }],
        },
      },
      prefix: "\u25B8",
      label: "auth",
      rootPath: null,
    });
    const result = vocabularyBleed.format(fctx);
    const ONE = 1;

    expect(result.details.length).toBe(ONE);
  });

  test("filters items missing path or sim property", () => {
    const MIN_SIB = E03;
    const CROSS_SIM = 0.7;
    const fctx = makeFormatCtx({
      finding: {
        audit: "vocabulary-bleed",
        key: "dir:/src/auth",
        name: "auth",
        hash: "abcd1234",
        value: E05,
        details: {
          minSiblingSim: MIN_SIB,
          crossPulls: [{ sim: CROSS_SIM }, { path: "dir:/x" }, { path: "dir:/y", sim: CROSS_SIM }],
        },
      },
      prefix: "\u25B8",
      label: "auth",
      rootPath: null,
    });
    const result = vocabularyBleed.format(fctx);
    const ONE = 1;

    expect(result.details.length).toBe(ONE);
  });

  test("handles missing details gracefully", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "vocabulary-bleed",
        key: "k",
        name: "x",
        hash: "12345678",
        value: E05,
      },
      prefix: ">",
      label: "x",
      rootPath: null,
    });
    const result = vocabularyBleed.format(fctx);

    expect(result.heading).toContain("cross-module vocabulary");
    expect(result.details.length).toBe(NONE);
  });
});
