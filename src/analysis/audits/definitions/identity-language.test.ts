import {
  E0,
  E01,
  E015,
  E02,
  E04,
  E05,
  E08,
  E085,
  E09,
  NONE,
  SENSITIVITY,
} from "../../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  makeDir,
  makeFile,
  makeFormatCtx,
  suppress,
  toNodeMap,
} from "../../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import identityLanguage from "./identity-language.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
};

/** Identity embeddings for axis score tests. */
const ID_A = [E09, E01, E0];
const ID_B = [E085, E015, E0];
const ID_C = [E08, E02, E0];

/** Axis scores: normal directories vs one that leans "is". */
const SCORE_GOOD = 0.7;
const SCORE_NORMAL_B = 0.65;
const SCORE_NORMAL_C = 0.6;
const SCORE_BAD = E01;

describe("identity-language detect — no axis scores", () => {
  test("returns empty when axisScores is null", () => {
    const dir = makeDir({ identity: ID_A });
    const nodes = toNodeMap(dir);
    const ctx = createContext(nodes, CONFIG, null);
    const findings = identityLanguage.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("identity-language detect — empty node map", () => {
  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const scores: Record<string, number> = {};
    const ctx = createContext(nodes, CONFIG, scores);
    const findings = identityLanguage.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("identity-language detect — flags low scorer", () => {
  test("flags directory with low is-does score", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: [E05, E05, E0],
      leaf: [E05, E05, E0],
      childKeys: ["dir:/src/auth", "dir:/src/api", "dir:/src/bad"],
      parentKey: null,
    });
    const dirA = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      identity: ID_A,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirB = makeDir({
      key: "dir:/src/api",
      name: "api",
      identity: ID_B,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirBad = makeDir({
      key: "dir:/src/bad",
      name: "bad",
      identity: ID_C,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const scores: Record<string, number> = {
      "dir:/src/auth": SCORE_GOOD,
      "dir:/src/api": SCORE_NORMAL_B,
      "dir:/src/bad": SCORE_BAD,
    };
    const nodes = toNodeMap(root, dirA, dirB, dirBad);
    const ctx = createContext(nodes, CONFIG, scores);
    const findings = identityLanguage.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).toContain(dirBad.key);
  });
});

describe("identity-language detect — skips root and no-score", () => {
  test("skips the root directory", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_A,
      childKeys: ["dir:/src/a", "dir:/src/b", "dir:/src/c"],
      parentKey: null,
    });
    const dirA = makeDir({
      key: "dir:/src/a",
      identity: ID_A,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirB = makeDir({
      key: "dir:/src/b",
      identity: ID_B,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirC = makeDir({
      key: "dir:/src/c",
      identity: ID_C,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const scores: Record<string, number> = {
      "dir:/src": SCORE_BAD,
      "dir:/src/a": SCORE_GOOD,
      "dir:/src/b": SCORE_NORMAL_B,
      "dir:/src/c": SCORE_NORMAL_C,
    };
    const nodes = toNodeMap(root, dirA, dirB, dirC);
    const ctx = createContext(nodes, CONFIG, scores);
    const findings = identityLanguage.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(root.key);
  });

  test("skips directories without axis scores", () => {
    const root = makeDir({
      key: "dir:/src",
      name: "src",
      identity: ID_A,
      childKeys: ["dir:/src/a", "dir:/src/b", "dir:/src/c"],
      parentKey: null,
    });
    const dirA = makeDir({
      key: "dir:/src/a",
      identity: ID_A,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirB = makeDir({
      key: "dir:/src/b",
      identity: ID_B,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirC = makeDir({
      key: "dir:/src/c",
      identity: ID_C,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const scores: Record<string, number> = {
      "dir:/src/a": SCORE_GOOD,
      "dir:/src/b": SCORE_NORMAL_B,
    };
    const nodes = toNodeMap(root, dirA, dirB, dirC);
    const ctx = createContext(nodes, CONFIG, scores);
    const findings = identityLanguage.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain("dir:/src/c");
  });
});

describe("identity-language detect — suppression", () => {
  test("respects suppression", () => {
    const root = makeDir({
      key: "dir:/src",
      identity: [E05, E05, E0],
      childKeys: ["dir:/src/a", "dir:/src/b", "dir:/src/bad"],
      parentKey: null,
    });
    const dirA = makeDir({
      key: "dir:/src/a",
      identity: ID_A,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirB = makeDir({
      key: "dir:/src/b",
      identity: ID_B,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirBad = makeDir({
      key: "dir:/src/bad",
      identity: ID_C,
      childKeys: [],
      parentKey: "dir:/src",
      residuals: [suppress("identity-language")],
    });
    const scores: Record<string, number> = {
      "dir:/src/a": SCORE_GOOD,
      "dir:/src/b": SCORE_NORMAL_B,
      "dir:/src/bad": SCORE_BAD,
    };
    const nodes = toNodeMap(root, dirA, dirB, dirBad);
    const ctx = createContext(nodes, CONFIG, scores);
    const findings = identityLanguage.detect(ctx);
    const keys = findings.map((f) => f.key);

    expect(keys).not.toContain(dirBad.key);
  });
});

describe("identity-language detect — too few entries", () => {
  test("returns empty when fewer than 3 entries for leave-one-out", () => {
    const root = makeDir({
      key: "dir:/src",
      identity: ID_A,
      childKeys: ["dir:/src/a", "dir:/src/b"],
      parentKey: null,
    });
    const dirA = makeDir({
      key: "dir:/src/a",
      identity: ID_A,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const dirB = makeDir({
      key: "dir:/src/b",
      identity: ID_B,
      childKeys: [],
      parentKey: "dir:/src",
    });
    const scores: Record<string, number> = {
      "dir:/src/a": SCORE_GOOD,
      "dir:/src/b": SCORE_BAD,
    };
    const nodes = toNodeMap(root, dirA, dirB);
    const ctx = createContext(nodes, CONFIG, scores);
    const findings = identityLanguage.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("identity-language format", () => {
  test("includes axis score and fence in details", () => {
    const AXIS_SCORE = E015;
    const FENCE_VALUE = E04;
    const fctx = makeFormatCtx({
      finding: {
        audit: "identity-language",
        key: "dir:/src/bad",
        name: "bad",
        hash: "abcd1234",
        value: AXIS_SCORE,
        fence: FENCE_VALUE,
      },
      prefix: "\u25B8",
      label: "bad",
    });
    const result = identityLanguage.format(fctx);

    expect(result.heading).toContain("is");
    expect(result.heading).toContain("does");
    expect(result.details[NONE]).toContain("Axis score");
  });

  test("formats with 0 when value and fence are undefined", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "identity-language",
        key: "dir:/src/bad",
        name: "bad",
        hash: "abcd1234",
        value: undefined,
        fence: undefined,
      },
    });
    const result = identityLanguage.format(fctx);

    expect(result.details[NONE]).toContain("0.00");
  });
});

describe("identity-language detect — ignores non-directory", () => {
  test("ignores file nodes even with axis scores", () => {
    const root = makeDir({
      key: "dir:/src",
      identity: ID_A,
      childKeys: [],
      parentKey: null,
    });
    const file = makeFile({
      key: "file:/src/a.ts",
      identity: ID_A,
      leaf: ID_A,
    });
    const scores: Record<string, number> = {
      "file:/src/a.ts": SCORE_BAD,
    };
    const nodes = toNodeMap(root, file);
    const ctx = createContext(nodes, CONFIG, scores);
    const findings = identityLanguage.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});
