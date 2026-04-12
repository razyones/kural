/**
 * Visual regression tests — snapshot the human-readable CLI output
 * so any formatting change is caught by a diff.
 */

import type { DirectoryRow, FileRow, FunctionRow, ScoreRow } from "../../src/db/schemas.ts";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  cleanupTmpRoot,
  createTmpRoot,
  runCli,
  seedActiveSnapshot,
  seedFullActiveSnapshot,
  seedSnapshot,
} from "./helpers.ts";
import type { SeedData } from "./helpers.ts";

const NONE = 0;
const TS_BASE = 1700000000000;
const TS_STEP = 1000;

/* ------------------------------------------------------------------ */
/*  Score values                                                      */
/* ------------------------------------------------------------------ */

const S065 = 0.65;
const S068 = 0.68;
const S07 = 0.7;
const S071 = 0.71;
const S072 = 0.72;
const S074 = 0.74;
const S075 = 0.75;
const S077 = 0.77;
const S078 = 0.78;
const S08 = 0.8;
const S082 = 0.82;
const S083 = 0.83;
const S085 = 0.85;
const S087 = 0.87;
const S09 = 0.9;
const S092 = 0.92;
const S093 = 0.93;
const S095 = 0.95;

/* ------------------------------------------------------------------ */
/*  Embedding values                                                  */
/* ------------------------------------------------------------------ */

const E0 = 0.0;
const E005 = 0.05;
const E01 = 0.1;
const E1 = 1.0;

/* ------------------------------------------------------------------ */
/*  Normalization — strip dynamic content for stable snapshots        */
/* ------------------------------------------------------------------ */

/** Replaces dynamic content with stable placeholders. */
function normalize(stdout: string, root: string): string {
  let out = stdout;
  // Strip ANSI escape sequences (cliui table borders use dim codes)
  // eslint-disable-next-line no-control-regex -- intentional ANSI stripping
  out = out.replaceAll(/\u001B\[\d+m/g, "");
  // Replace temp root path with placeholder
  out = out.replaceAll(root, "<ROOT>");
  // Replace locale-formatted dates (e.g., "4/2/2026, 9:43:24 AM" or "11/4/2026, 2:02:11 pm").
  out = out.replaceAll(/\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}[\s\u202F]+[AP]M/gi, "<DATE>");
  // Replace ISO dates (e.g., "2026-04-02T...")
  out = out.replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<ISO_DATE>");
  // Replace relative paths that escape the root (../../.../T/kural-e2e-...)
  out = out.replaceAll(/(?:\.\.\/)+[\w/.-]*kural-e2e-[\w/.-]*/g, "<ROOT_REL>");
  // Replace 8-char hex hashes in brackets (e.g., [abcd1234])
  out = out.replaceAll(/\[[0-9a-f]{8}\]/g, "[<HASH>]");
  // Normalize table widths — collapse repeated ─ and fluid column padding
  // so snapshots are independent of terminal width
  out = out.replaceAll(/─{4,}/g, "────");
  out = out.replaceAll(/ {2,}│/g, " │");
  return out;
}

/** Builds score rows for snapshot testing. */
function makeScoreRows(root: string): ScoreRow[] {
  return [
    {
      key: `dir:${root}/src`,
      kind: "directory",
      name: "src",
      uniqueness: S08,
      fit: S075,
      score: S077,
      childrenFit: S07,
      childrenUniqueness: S065,
      childrenScore: S068,
      subtreeFit: S072,
      subtreeUniqueness: S07,
      subtreeScore: S071,
      overallScore: S074,
    },
    {
      key: `file:${root}/src/app.ts`,
      kind: "file",
      name: "app.ts",
      uniqueness: S09,
      fit: S085,
      score: S087,
      childrenFit: S08,
      childrenUniqueness: S075,
      childrenScore: S077,
      subtreeFit: S082,
      subtreeUniqueness: S078,
      subtreeScore: S08,
      overallScore: S083,
    },
    {
      key: `func:${root}/src/app.ts:main`,
      kind: "function",
      name: "main",
      uniqueness: S095,
      fit: S092,
      score: S093,
      overallScore: S093,
    },
  ];
}

/** Builds seed data for a small project with incomplete docs. */
function makeAuditProject(root: string): SeedData {
  const p = `${root}/src`;
  const dirs: DirectoryRow[] = [
    {
      path: p,
      name: "src",
      description: "Root",
      children: [`${p}/app.ts`],
      identityEmbedding: [E1, E0],
      leafEmbedding: [E1, E0],
      residuals: [],
    },
  ];
  const files: FileRow[] = [
    {
      path: `${p}/app.ts`,
      name: "app.ts",
      description: "App file",
      identityEmbedding: [E1, E0],
      leafEmbedding: [E1, E0],
      importsInternal: [],
      importsExternal: [],
      residuals: [],
    },
  ];
  const fns: FunctionRow[] = [
    {
      path: `${p}/app.ts`,
      name: "run",
      params: ["string"],
      paramNames: ["config"],
      documentedParams: NONE,
      returnsType: "string",
      hasReturnDoc: false,
      pure: false,
      exported: true,
      util: false,
      helper: false,
      residuals: [],
      calls: [],
      identityEmbedding: [E01, E1],
      leafEmbedding: [E005, E1],
    },
  ];
  return { directories: dirs, files, functions: fns };
}

let tmpRoot = "";

afterEach(() => {
  cleanupTmpRoot(tmpRoot);
  tmpRoot = "";
});

/* ------------------------------------------------------------------ */
/*  snapshot list                                                     */
/* ------------------------------------------------------------------ */

describe("visual: snapshot list", () => {
  it("renders the list banner and snapshot rows", async () => {
    tmpRoot = createTmpRoot();
    await seedSnapshot(tmpRoot, "main", TS_BASE, "abc0001", "baseline");
    await seedSnapshot(tmpRoot, "main", TS_BASE + TS_STEP, "def0002");

    const { stdout } = runCli(["snapshot", "list"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });

  it("renders empty state warning", () => {
    tmpRoot = createTmpRoot();
    const { stdout } = runCli(["snapshot", "list"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });
});

/* ------------------------------------------------------------------ */
/*  score                                                             */
/* ------------------------------------------------------------------ */

describe("visual: score", () => {
  it("renders the hero score display", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", makeScoreRows(tmpRoot));

    const { stdout } = runCli(["score"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });

  it("renders the score breakdown table with -e", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", makeScoreRows(tmpRoot));

    const { stdout } = runCli(["score", "-e"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });

  it("renders empty state warning", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", []);

    const { stdout } = runCli(["score"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });
});

/* ------------------------------------------------------------------ */
/*  audit                                                             */
/* ------------------------------------------------------------------ */

describe("visual: audit", () => {
  it("renders the audit report with findings", async () => {
    tmpRoot = createTmpRoot();
    await seedFullActiveSnapshot(tmpRoot, "main", makeAuditProject(tmpRoot));

    const { stdout } = runCli(["audit"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });

  it("renders clean audit (no findings)", async () => {
    tmpRoot = createTmpRoot();
    // All docs present → no findings
    await seedFullActiveSnapshot(tmpRoot, "main", {
      directories: [
        {
          path: `${tmpRoot}/src`,
          name: "src",
          description: "Root",
          children: [`${tmpRoot}/src/app.ts`],
          identityEmbedding: [E1, E0],
          leafEmbedding: [E1, E0],
          residuals: [],
        },
      ],
      files: [
        {
          path: `${tmpRoot}/src/app.ts`,
          name: "app.ts",
          description: "App file",
          identityEmbedding: [E1, E0],
          leafEmbedding: [E1, E0],
          importsInternal: [],
          importsExternal: [],
          residuals: [],
        },
      ],
      functions: [
        {
          path: `${tmpRoot}/src/app.ts`,
          name: "run",
          description: "Runs the application",
          params: ["string"],
          paramNames: ["config"],
          documentedParams: 1,
          returnsType: "string",
          hasReturnDoc: true,
          pure: true,
          exported: true,
          util: false,
          helper: false,
          residuals: [],
          calls: [],
          identityEmbedding: [E1, E0],
          leafEmbedding: [E1, E0],
        },
      ],
    });

    const { stdout } = runCli(["audit"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });
});

/* ------------------------------------------------------------------ */
/*  snapshot pin / unpin / delete                                     */
/* ------------------------------------------------------------------ */

describe("visual: snapshot pin/unpin/delete", () => {
  it("renders pin success message", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "abc0001");

    const { stdout } = runCli(["snapshot", "pin", id, "release"], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });

  it("renders unpin success message", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "abc0001", "release");

    const { stdout } = runCli(["snapshot", "unpin", id], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });

  it("renders delete success message", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "abc0001");

    const { stdout } = runCli(["snapshot", "delete", id], tmpRoot);
    expect(normalize(stdout, tmpRoot)).toMatchSnapshot();
  });
});
