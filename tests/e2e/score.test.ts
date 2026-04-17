/**
 * E2E tests for `kural score`.
 * Spawns the built CLI against a temp directory with seeded active snapshots.
 */

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  cleanupTmpRoot,
  createTmpRoot,
  extractJson,
  runCli,
  seedActiveSnapshot,
  seedSnapshot,
} from "./helpers.ts";
import type { ScoreRow } from "../../src/db/schemas.ts";

const NONE = 0;
const TS_BASE = 1700000000000;

/** Score values used in the seeded project. */
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

/** Minimal score rows for a small project with a directory, file, and function. */
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

let tmpRoot = "";

afterEach(() => {
  cleanupTmpRoot(tmpRoot);
  tmpRoot = "";
});

describe("kural score", () => {
  it("displays scores for the active snapshot", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", makeScoreRows(tmpRoot));

    const { stdout, exitCode } = runCli(["score"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("Score:");
  });

  it("warns when no scores exist", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", []);

    const { stdout, exitCode } = runCli(["score"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("No scores found");
  });

  it("outputs JSON with --json flag", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", makeScoreRows(tmpRoot));

    const { stdout, exitCode } = runCli(["score", "--json"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{
      kind: string;
      branch: string;
      snapshot: string;
      overallScore: number;
    }>(stdout);
    expect(parsed.kind).toBe("directory");
    expect(parsed.branch).toBe("main");
    expect(parsed.snapshot).toBe("active");
    expect(parsed.overallScore).toBe(S074);
  });

  it("outputs JSON with --json --explain flag", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", makeScoreRows(tmpRoot));

    const { stdout, exitCode } = runCli(["score", "--json", "-e"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{
      breakdown: Array<{ kind: string; name: string; overall: number | null }>;
      total: number;
    }>(stdout);
    expect(parsed.total).toBe(makeScoreRows(tmpRoot).length);
    expect(parsed.breakdown.length).toBeGreaterThan(NONE);
  });

  it("reads from a history snapshot via --snapshot flag", async () => {
    tmpRoot = createTmpRoot();
    const scores = makeScoreRows(tmpRoot);
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001", { scores });

    const { stdout, exitCode } = runCli(["score", "--snapshot", id, "--json"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{ snapshot: string; overallScore: number }>(stdout);
    expect(parsed.snapshot).toBe(id);
    expect(parsed.overallScore).toBe(S074);
  });

  it("outputs error JSON when no scores found with --json", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", []);

    const { stdout, exitCode } = runCli(["score", "--json"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{ error: string }>(stdout);
    expect(parsed.error).toBe("No scores found");
  });

  it("renders glossary with the normalized (0…1) range", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", makeScoreRows(tmpRoot));

    const { stdout, exitCode } = runCli(["score"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("Self — how well this node fits under its parent (0\u20261)");
    expect(stdout).not.toContain("(-1\u20261)");
  });

  it("every breakdown score in --json --explain output is in [0, 1]", async () => {
    tmpRoot = createTmpRoot();
    await seedActiveSnapshot(tmpRoot, "main", makeScoreRows(tmpRoot));

    const { stdout, exitCode } = runCli(["score", "--json", "-e"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{
      breakdown: Array<{
        self: number | null;
        children: number | null;
        subtree: number | null;
        overall: number | null;
      }>;
    }>(stdout);
    const ONE = 1;
    for (const row of parsed.breakdown) {
      for (const v of [row.self, row.children, row.subtree, row.overall]) {
        if (v === null) {
          continue;
        }
        expect(v).toBeGreaterThanOrEqual(NONE);
        expect(v).toBeLessThanOrEqual(ONE);
      }
    }
  });
});
