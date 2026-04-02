/**
 * E2E tests that deliberately trigger each audit via the CLI.
 * Each test crafts seed data designed to produce at least one finding
 * for a specific audit, then verifies it appears in JSON output.
 */

import type { DirectoryRow, FileRow, FunctionRow } from "../../src/db/schemas.ts";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  cleanupTmpRoot,
  createTmpRoot,
  extractJson,
  runCli,
  seedFullActiveSnapshot,
} from "./helpers.ts";
import type { SeedData } from "./helpers.ts";

/* ------------------------------------------------------------------ */
/*  Named constants — embedding components and test config            */
/* ------------------------------------------------------------------ */

const NONE = 0;
const E0 = 0.0;
const E001 = 0.01;
const E005 = 0.05;
const E006 = 0.06;
const E01 = 0.1;
const E012 = 0.12;
const E013 = 0.13;
const E015 = 0.15;
const E02 = 0.2;
const E04 = 0.4;
const E05 = 0.5;
const E06 = 0.6;
const E08 = 0.8;
const E085 = 0.85;
const E087 = 0.87;
const E088 = 0.88;
const E09 = 0.9;
const E094 = 0.94;
const E095 = 0.95;
const E099 = 0.99;
const E1 = 1.0;

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                    */
/* ------------------------------------------------------------------ */

type AuditJson = {
  total: number;
  audits: Array<{ name: string; count: number; findings: Array<{ audit: string }> }>;
};

function auditJson(root: string, extra: string[] = []): AuditJson {
  const { stdout, exitCode } = runCli(["audit", "--json", ...extra], root);
  expect(exitCode).toBe(NONE);
  return extractJson<AuditJson>(stdout);
}

function expectAudit(result: AuditJson, name: string): void {
  const match = result.audits.find((a) => a.name === name);
  expect(match, `Expected audit "${name}" to have findings`).toBeDefined();
  expect(match?.count).toBeGreaterThan(NONE);
}

/** Builds a minimal documented function row. */
function fn(
  path: string,
  name: string,
  leaf: number[],
  extra: Partial<FunctionRow> = {},
): FunctionRow {
  return {
    path,
    name,
    description: extra.description ?? `Function ${name}`,
    params: extra.params ?? [],
    paramNames: extra.paramNames ?? [],
    documentedParams: extra.documentedParams ?? NONE,
    returnsType: extra.returnsType ?? "void",
    hasReturnDoc: extra.hasReturnDoc ?? false,
    pure: extra.pure ?? true,
    exported: extra.exported ?? true,
    util: extra.util ?? false,
    helper: extra.helper ?? false,
    residuals: extra.residuals ?? [],
    calls: extra.calls ?? [],
    identityEmbedding: extra.identityEmbedding ?? leaf,
    leafEmbedding: leaf,
    bound: extra.bound,
  };
}

/** Builds a minimal file row. */
function file(path: string, name: string, leaf: number[], desc?: string): FileRow {
  return {
    path,
    name,
    description: desc ?? `File ${name}`,
    identityEmbedding: leaf,
    leafEmbedding: leaf,
    importsInternal: [],
    importsExternal: [],
    residuals: [],
  };
}

/** Builds a minimal directory row. */
function dir(
  path: string,
  name: string,
  children: string[],
  identity: number[],
  leaf?: number[],
  desc?: string,
): DirectoryRow {
  return {
    path,
    name,
    description: desc ?? `Directory ${name}`,
    children,
    identityEmbedding: identity,
    leafEmbedding: leaf ?? identity,
    residuals: [],
  };
}

let tmpRoot = "";

afterEach(() => {
  cleanupTmpRoot(tmpRoot);
  tmpRoot = "";
});

/* ------------------------------------------------------------------ */
/*  incomplete-docs                                                   */
/* ------------------------------------------------------------------ */

describe("incomplete-docs trigger", () => {
  it("flags function missing description, params, returns, purity", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;
    const data: SeedData = {
      directories: [dir(p, "src", [`${p}/app.ts`], [E1, E0])],
      files: [file(`${p}/app.ts`, "app.ts", [E1, E0])],
      functions: [
        fn(`${p}/app.ts`, "undocumented", [E1, E0], {
          description: undefined,
          paramNames: ["x"],
          returnsType: "string",
          pure: false,
        }),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "incomplete-docs");
  });
});

/* ------------------------------------------------------------------ */
/*  focal-drift                                                       */
/* ------------------------------------------------------------------ */

describe("focal-drift trigger", () => {
  it("flags outward-bound function overtaken by a closer sibling", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;
    const data: SeedData = {
      directories: [dir(p, "src", [`${p}/app.ts`], [E1, E0])],
      files: [file(`${p}/app.ts`, "app.ts", [E1, E0])],
      functions: [
        fn(`${p}/app.ts`, "focal", [E0, E1], { bound: "outward" }),
        fn(`${p}/app.ts`, "overtaker", [E1, E0]),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "focal-drift");
  });
});

/* ------------------------------------------------------------------ */
/*  incoherent                                                        */
/* ------------------------------------------------------------------ */

describe("incoherent trigger", () => {
  it("flags file whose identity and leaf embeddings are orthogonal", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    const coherentNames = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
    const coherentFiles = coherentNames.map((f) => file(`${p}/${f}`, f, [E09, E01, E0]));
    const coherentFns = coherentNames.map((f) =>
      fn(`${p}/${f}`, `fn_${f.replace(".ts", "")}`, [E088, E012, E0]),
    );

    const data: SeedData = {
      directories: [
        dir(p, "src", [...coherentNames.map((f) => `${p}/${f}`), `${p}/bad.ts`], [E05, E05, E0]),
      ],
      files: [
        ...coherentFiles,
        {
          ...file(`${p}/bad.ts`, "bad.ts", [E0, E0, E1]),
          identityEmbedding: [E1, E0, E0],
        },
      ],
      functions: [...coherentFns, fn(`${p}/bad.ts`, "fn_bad", [E0, E0, E1])],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "incoherent");
  });
});

/* ------------------------------------------------------------------ */
/*  outliers                                                          */
/* ------------------------------------------------------------------ */

describe("outliers trigger", () => {
  it("flags function orthogonal to its siblings", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    const similarLeafs: number[][] = [
      [E09, E01, E0],
      [E085, E015, E0],
      [E088, E012, E0],
      [E087, E013, E0],
    ];
    const fns = similarLeafs.map((leaf, i) => fn(`${p}/app.ts`, `fn${String(i)}`, leaf));
    fns.push(fn(`${p}/app.ts`, "outlier", [E0, E0, E1]));

    const data: SeedData = {
      directories: [dir(p, "src", [`${p}/app.ts`], [E05, E05, E0])],
      files: [file(`${p}/app.ts`, "app.ts", [E08, E02, E0])],
      functions: fns,
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "outliers");
  });
});

/* ------------------------------------------------------------------ */
/*  duplicates                                                        */
/* ------------------------------------------------------------------ */

describe("duplicates trigger", () => {
  it("flags near-identical functions in separate files", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    // Baseline siblings to establish a finite merge fence
    const baseLeafs: number[][] = [
      [E0, E0, E1, E0, E0, E0],
      [E0, E0, E0, E1, E0, E0],
      [E0, E0, E0, E0, E1, E0],
      [E0, E0, E0, E0, E0, E1],
    ];
    const baseFns = baseLeafs.map((leaf, i) => fn(`${p}/base.ts`, `s${String(i)}`, leaf));

    const data: SeedData = {
      directories: [
        dir(p, "src", [`${p}/base.ts`, `${p}/a.ts`, `${p}/b.ts`], [E05, E05, E0, E0, E0, E0]),
      ],
      files: [
        file(`${p}/base.ts`, "base.ts", [E0, E0, E05, E05, E0, E0]),
        file(`${p}/a.ts`, "a.ts", [E095, E005, E0, E0, E0, E0]),
        file(`${p}/b.ts`, "b.ts", [E094, E006, E0, E0, E0, E0]),
      ],
      functions: [
        ...baseFns,
        fn(`${p}/a.ts`, "fnA", [E095, E005, E0, E0, E0, E0]),
        fn(`${p}/b.ts`, "fnB", [E094, E006, E0, E0, E0, E0]),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "duplicates");
  });
});

/* ------------------------------------------------------------------ */
/*  containments                                                      */
/* ------------------------------------------------------------------ */

describe("containments trigger", () => {
  it("flags file where one child overwhelmingly dominates", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    // Balanced files to establish a low-gap baseline
    const balNames = ["x.ts", "y.ts", "z.ts", "w.ts"];
    const balFiles = balNames.map((f) => file(`${p}/${f}`, f, [E05, E05, E0]));
    const balFns = balNames.flatMap((f) => {
      const base = f.replace(".ts", "");
      return [
        fn(`${p}/${f}`, `a_${base}`, [E06, E04, E0]),
        fn(`${p}/${f}`, `b_${base}`, [E04, E06, E0]),
      ];
    });

    const data: SeedData = {
      directories: [
        dir(p, "src", [...balNames.map((f) => `${p}/${f}`), `${p}/dom.ts`], [E05, E05, E0]),
      ],
      files: [...balFiles, file(`${p}/dom.ts`, "dom.ts", [E1, E0, E0])],
      functions: [
        ...balFns,
        fn(`${p}/dom.ts`, "dominant", [E099, E001, E0]),
        fn(`${p}/dom.ts`, "weakA", [E0, E1, E0]),
        fn(`${p}/dom.ts`, "weakB", [E0, E0, E1]),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "containments");
  });
});

/* ------------------------------------------------------------------ */
/*  identity-language                                                 */
/* ------------------------------------------------------------------ */

describe("identity-language trigger", () => {
  it("flags directory whose description leans toward is instead of does", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;
    const authPath = `${p}/auth`;
    const apiPath = `${p}/api`;
    const badPath = `${p}/bad`;

    const data: SeedData = {
      directories: [
        dir(p, "src", [authPath, apiPath, badPath], [E05, E05, E0]),
        dir(authPath, "auth", [], [E1, E0, E0]),
        dir(apiPath, "api", [], [E0, E1, E0]),
        dir(badPath, "bad", [], [E0, E0, E1]),
      ],
      files: [],
      functions: [],
      extraMetadata: [
        {
          key: "axis-scores:is-does",
          value: JSON.stringify({
            [`dir:${authPath}`]: E08,
            [`dir:${apiPath}`]: E08,
            [`dir:${badPath}`]: E01,
          }),
        },
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "identity-language");
  });
});

/* ------------------------------------------------------------------ */
/*  incoherent-utils                                                  */
/* ------------------------------------------------------------------ */

describe("incoherent-utils trigger", () => {
  it("flags util file whose identity and leaf embeddings are orthogonal", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    // All functions are util → tree builder propagates util to files
    const coherentNames = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
    const coherentFiles = coherentNames.map((f) => file(`${p}/${f}`, f, [E09, E01, E0]));
    const coherentFns = coherentNames.map((f) =>
      fn(`${p}/${f}`, `fn_${f.replace(".ts", "")}`, [E088, E012, E0], { util: true }),
    );

    const data: SeedData = {
      directories: [
        dir(p, "src", [...coherentNames.map((f) => `${p}/${f}`), `${p}/bad.ts`], [E05, E05, E0]),
      ],
      files: [
        ...coherentFiles,
        {
          ...file(`${p}/bad.ts`, "bad.ts", [E0, E0, E1]),
          identityEmbedding: [E1, E0, E0],
        },
      ],
      functions: [...coherentFns, fn(`${p}/bad.ts`, "fn_bad", [E0, E0, E1], { util: true })],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "incoherent-utils");
  });
});

/* ------------------------------------------------------------------ */
/*  util-duplicates                                                   */
/* ------------------------------------------------------------------ */

describe("util-duplicates trigger", () => {
  it("flags near-identical util functions in separate files", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    // Non-util baseline siblings to establish a finite merge fence
    const baseLeafs: number[][] = [
      [E0, E0, E1, E0, E0, E0],
      [E0, E0, E0, E1, E0, E0],
      [E0, E0, E0, E0, E1, E0],
      [E0, E0, E0, E0, E0, E1],
    ];
    const baseFns = baseLeafs.map((leaf, i) => fn(`${p}/base.ts`, `s${String(i)}`, leaf));

    const data: SeedData = {
      directories: [
        dir(p, "src", [`${p}/base.ts`, `${p}/a.ts`, `${p}/b.ts`], [E05, E05, E0, E0, E0, E0]),
      ],
      files: [
        file(`${p}/base.ts`, "base.ts", [E0, E0, E05, E05, E0, E0]),
        file(`${p}/a.ts`, "a.ts", [E095, E005, E0, E0, E0, E0]),
        file(`${p}/b.ts`, "b.ts", [E094, E006, E0, E0, E0, E0]),
      ],
      functions: [
        ...baseFns,
        fn(`${p}/a.ts`, "utilA", [E095, E005, E0, E0, E0, E0], { util: true }),
        fn(`${p}/b.ts`, "utilB", [E094, E006, E0, E0, E0, E0], { util: true }),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "util-duplicates");
  });
});

/*
 * Audits not tested here (statistical thresholds require precise
 * dendrogram gap / fence calibration better validated by unit tests):
 * - merge-candidates
 * - bloated-directories
 * - bloated-files
 * - misplaced (needs multi-level directory tree)
 * - vocabulary-bleed (needs cross-directory identity overlap)
 */
