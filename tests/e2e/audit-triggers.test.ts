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
const E03 = 0.3;
const E04 = 0.4;
const E045 = 0.45;
const E055 = 0.55;
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
const SLIGHT_COUNT = 8;

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
    helper: false,
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
    util: false,
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
    const coherentFns = coherentNames.flatMap((f) => [
      fn(`${p}/${f}`, `fn_${f.replace(".ts", "")}_a`, [E088, E012, E0]),
      fn(`${p}/${f}`, `fn_${f.replace(".ts", "")}_b`, [E088, E012, E0]),
    ]);

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
      functions: [
        ...coherentFns,
        fn(`${p}/bad.ts`, "fn_bad_a", [E0, E0, E1]),
        fn(`${p}/bad.ts`, "fn_bad_b", [E0, E0, E1]),
      ],
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
/*  incoherent-utils                                                  */
/* ------------------------------------------------------------------ */

describe("incoherent-utils trigger", () => {
  it("flags util file whose identity and leaf embeddings are orthogonal", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    // All functions are util → tree builder propagates util to files
    const coherentNames = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
    const coherentFiles = coherentNames.map((f) => file(`${p}/${f}`, f, [E09, E01, E0]));
    const coherentFns = coherentNames.flatMap((f) => [
      fn(`${p}/${f}`, `fn_${f.replace(".ts", "")}_a`, [E088, E012, E0], { util: true }),
      fn(`${p}/${f}`, `fn_${f.replace(".ts", "")}_b`, [E088, E012, E0], { util: true }),
    ]);

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
      functions: [
        ...coherentFns,
        fn(`${p}/bad.ts`, "fn_bad_a", [E0, E0, E1], { util: true }),
        fn(`${p}/bad.ts`, "fn_bad_b", [E0, E0, E1], { util: true }),
      ],
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

/* ------------------------------------------------------------------ */
/*  misplaced                                                         */
/* ------------------------------------------------------------------ */

describe("misplaced trigger", () => {
  it("flags file that fits an uncle directory better than its parent", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;
    const auth = `${p}/auth`;
    const api = `${p}/api`;
    const db = `${p}/db`;

    // 1 misfit file under auth whose leaf points at api
    // 8 slight files under auth with small deltas to establish the baseline
    // Slightly toward api
    const slightLeaf = [E045, E055, E0];
    const slightFiles: FileRow[] = [];
    const slightFns: FunctionRow[] = [];
    for (let i = NONE; i < SLIGHT_COUNT; i++) {
      const name = `s${String(i)}.ts`;
      const fpath = `${auth}/${name}`;
      slightFiles.push(file(fpath, name, slightLeaf));
      slightFns.push(fn(fpath, `fn_s${String(i)}`, slightLeaf));
    }

    const misfitPath = `${auth}/misfit.ts`;
    // Strongly fits api [0,1,0]
    const misfitLeaf = [E0, E095, E005];

    const data: SeedData = {
      directories: [
        dir(p, "src", [auth, api, db], [E05, E05, E0]),
        dir(auth, "auth", [...slightFiles.map((f) => f.path), misfitPath], [E1, E0, E0]),
        dir(api, "api", [], [E0, E1, E0]),
        dir(db, "db", [], [E0, E0, E1]),
      ],
      files: [...slightFiles, file(misfitPath, "misfit.ts", misfitLeaf)],
      functions: [...slightFns, fn(misfitPath, "fn_misfit", misfitLeaf)],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "misplaced");
  });
});

/* ------------------------------------------------------------------ */
/*  vocabulary-bleed                                                  */
/* ------------------------------------------------------------------ */

describe("vocabulary-bleed trigger", () => {
  it("flags directory whose identity is closer to a non-sibling than its weakest sibling", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;
    const auth = `${p}/auth`;
    const api = `${p}/api`;
    const db = `${p}/db`;
    const other = `${tmpRoot}/other`;

    // auth identity = [0, 0.95, 0.05] ≈ api [0,1,0], far from db [0,0,1]
    // minSiblingSim(auth) = min(sim(auth,api), sim(auth,db)) ≈ sim(auth,db) ≈ 0.05
    // crossPull to "other" [0.3, 0.3, 0.4]: sim(auth,other) ≈ 0.38
    // delta = 0.38 - 0.05 = 0.33, should exceed fence of well-behaved dirs

    const data: SeedData = {
      directories: [
        dir(p, "src", [auth, api, db], [E05, E05, E0]),
        dir(auth, "auth", [], [E0, E095, E005]),
        dir(api, "api", [], [E0, E1, E0]),
        dir(db, "db", [], [E0, E0, E1]),
        dir(other, "other", [], [E03, E03, E04]),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "vocabulary-bleed");
  });
});

/* ------------------------------------------------------------------ */
/*  merge-candidates                                                  */
/* ------------------------------------------------------------------ */

describe("merge-candidates trigger", () => {
  it("flags near-identical sibling functions under the same file", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    // 4 orthogonal siblings to keep the fence low + 2 near-identical to breach it
    const spreadLeafs: number[][] = [
      [E0, E0, E1, E0, E0, E0],
      [E0, E0, E0, E1, E0, E0],
      [E0, E0, E0, E0, E1, E0],
      [E0, E0, E0, E0, E0, E1],
    ];
    const spreadFns = spreadLeafs.map((leaf, i) => fn(`${p}/app.ts`, `spread${String(i)}`, leaf));

    const data: SeedData = {
      directories: [dir(p, "src", [`${p}/app.ts`], [E05, E05, E0, E0, E0, E0])],
      files: [file(`${p}/app.ts`, "app.ts", [E05, E05, E0, E0, E0, E0])],
      functions: [
        ...spreadFns,
        fn(`${p}/app.ts`, "nearA", [E095, E005, E0, E0, E0, E0]),
        fn(`${p}/app.ts`, "nearB", [E094, E006, E0, E0, E0, E0]),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "merge-candidates");
  });
});

/* ------------------------------------------------------------------ */
/*  bloated-directories                                               */
/* ------------------------------------------------------------------ */

describe("bloated-directories trigger", () => {
  it("flags directory with two distinct clusters of children", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    // Cluster A (dim 0) and Cluster B (dim 5), 3 files each
    const clusterA = ["a1.ts", "a2.ts", "a3.ts"].map((f, i) => {
      const leafs = [
        [E09, E01, E0, E0, E0, E0, E0, E0],
        [E085, E015, E0, E0, E0, E0, E0, E0],
        [E088, E012, E0, E0, E0, E0, E0, E0],
      ];
      return file(`${p}/${f}`, f, leafs[i]);
    });
    const clusterB = ["b1.ts", "b2.ts", "b3.ts"].map((f, i) => {
      const leafs = [
        [E0, E0, E0, E0, E0, E09, E01, E0],
        [E0, E0, E0, E0, E0, E085, E015, E0],
        [E0, E0, E0, E0, E0, E088, E012, E0],
      ];
      return file(`${p}/${f}`, f, leafs[i]);
    });
    const allFiles = [...clusterA, ...clusterB];

    // Each file needs a child function so it's not a leaf
    const fns = allFiles.map((f) => fn(f.path, `fn_${f.name.replace(".ts", "")}`, f.leafEmbedding));

    const data: SeedData = {
      directories: [
        dir(
          p,
          "src",
          allFiles.map((f) => f.path),
          [E05, E0, E0, E0, E0, E05, E0, E0],
        ),
      ],
      files: allFiles,
      functions: fns,
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "bloated-directories");
  });
});

/* ------------------------------------------------------------------ */
/*  bloated-files                                                     */
/* ------------------------------------------------------------------ */

describe("bloated-files trigger", () => {
  it("flags file with two distinct clusters of function children", async () => {
    tmpRoot = createTmpRoot();
    const p = `${tmpRoot}/src`;

    const data: SeedData = {
      directories: [dir(p, "src", [`${p}/big.ts`], [E05, E0, E0, E0, E0, E05, E0, E0])],
      files: [file(`${p}/big.ts`, "big.ts", [E05, E0, E0, E0, E0, E05, E0, E0])],
      functions: [
        fn(`${p}/big.ts`, "a1", [E09, E01, E0, E0, E0, E0, E0, E0]),
        fn(`${p}/big.ts`, "a2", [E085, E015, E0, E0, E0, E0, E0, E0]),
        fn(`${p}/big.ts`, "a3", [E088, E012, E0, E0, E0, E0, E0, E0]),
        fn(`${p}/big.ts`, "b1", [E0, E0, E0, E0, E0, E09, E01, E0]),
        fn(`${p}/big.ts`, "b2", [E0, E0, E0, E0, E0, E085, E015, E0]),
        fn(`${p}/big.ts`, "b3", [E0, E0, E0, E0, E0, E088, E012, E0]),
      ],
    };
    await seedFullActiveSnapshot(tmpRoot, "main", data);
    expectAudit(auditJson(tmpRoot), "bloated-files");
  });
});
