/**
 * E2E tests for `kural snapshot list`.
 * Spawns the built CLI against a temp directory with seeded snapshots.
 */

import { afterEach, describe, expect, it } from "vite-plus/test";
import { cleanupTmpRoot, createTmpRoot, extractJson, runCli, seedSnapshot } from "./helpers.ts";

const NONE = 0;
const ONE = 1;
const TS_BASE = 1700000000000;
const TS_STEP = 1000;

let tmpRoot = "";

afterEach(() => {
  cleanupTmpRoot(tmpRoot);
  tmpRoot = "";
});

describe("kural snapshot list", () => {
  it("prints a warning when no snapshots exist", () => {
    tmpRoot = createTmpRoot();
    const { stdout, exitCode } = runCli(["snapshot", "list"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("No snapshots found");
  });

  it("lists seeded snapshots with IDs", async () => {
    tmpRoot = createTmpRoot();
    const id1 = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001");
    const id2 = await seedSnapshot(tmpRoot, "main", TS_BASE + TS_STEP, "bbb0001");

    const { stdout, exitCode } = runCli(["snapshot", "list"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain(id1);
    expect(stdout).toContain(id2);
  });

  it("shows pin names next to pinned snapshots", async () => {
    tmpRoot = createTmpRoot();
    await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001", "baseline");
    await seedSnapshot(tmpRoot, "main", TS_BASE + TS_STEP, "bbb0001");

    const { stdout, exitCode } = runCli(["snapshot", "list"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("baseline");
  });

  it("outputs valid JSON with --json flag", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001", "v1");

    const { stdout, exitCode } = runCli(["snapshot", "list", "--json"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<
      Array<{
        snapshotId: string;
        timestamp: number;
        date: string;
        pinName: string | null;
      }>
    >(stdout);
    expect(parsed).toHaveLength(ONE);
    expect(parsed[NONE].snapshotId).toBe(id);
    expect(parsed[NONE].pinName).toBe("v1");
    expect(parsed[NONE].date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns empty JSON array when no snapshots exist", () => {
    tmpRoot = createTmpRoot();
    const { stdout, exitCode } = runCli(["snapshot", "list", "--json"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<unknown[]>(stdout);
    expect(parsed).toHaveLength(NONE);
  });
});
