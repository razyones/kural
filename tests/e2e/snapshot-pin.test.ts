/**
 * E2E tests for `kural snapshot pin`, `snapshot unpin`, and `snapshot delete`.
 * Spawns the built CLI against a temp directory with seeded snapshots.
 */

import { afterEach, describe, expect, it } from "vite-plus/test";
import { cleanupTmpRoot, createTmpRoot, extractJson, runCli, seedSnapshot } from "./helpers.ts";

const NONE = 0;
const ONE = 1;
const TS_BASE = 1700000000000;
const TS_STEP = 1000;

type ListEntry = {
  snapshotId: string;
  pinName: string | null;
};

/** Parses `snapshot list --json` output into entries. */
function listSnapshots(root: string): ListEntry[] {
  const { stdout } = runCli(["snapshot", "list", "--json"], root);
  return extractJson<ListEntry[]>(stdout);
}

let tmpRoot = "";

afterEach(() => {
  cleanupTmpRoot(tmpRoot);
  tmpRoot = "";
});

describe("kural snapshot pin", () => {
  it("pins a snapshot by ID", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001");

    const { stdout, exitCode } = runCli(["snapshot", "pin", id, "release"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("Pinned");
    expect(stdout).toContain("release");

    const list = listSnapshots(tmpRoot);
    expect(list[NONE].pinName).toBe("release");
  });

  it("moves a pin from one snapshot to another", async () => {
    tmpRoot = createTmpRoot();
    const id1 = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001", "v1");
    const id2 = await seedSnapshot(tmpRoot, "main", TS_BASE + TS_STEP, "bbb0001");

    const { exitCode } = runCli(["snapshot", "pin", id2, "v1"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const list = listSnapshots(tmpRoot);
    const first = list.find((s) => s.snapshotId === id1);
    const second = list.find((s) => s.snapshotId === id2);
    expect(first?.pinName).toBeNull();
    expect(second?.pinName).toBe("v1");
  });

  it("fails for a nonexistent snapshot", () => {
    tmpRoot = createTmpRoot();
    const { exitCode, stderr } = runCli(["snapshot", "pin", "fake-id", "name"], tmpRoot);

    expect(exitCode).not.toBe(NONE);
    expect(stderr).toContain("not found");
  });
});

describe("kural snapshot unpin", () => {
  it("removes a pin by snapshot ID", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001", "release");

    const { stdout, exitCode } = runCli(["snapshot", "unpin", id], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("Unpinned");

    const list = listSnapshots(tmpRoot);
    expect(list[NONE].pinName).toBeNull();
  });

  it("removes a pin by pin name", async () => {
    tmpRoot = createTmpRoot();
    await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001", "release");

    const { exitCode } = runCli(["snapshot", "unpin", "release"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const list = listSnapshots(tmpRoot);
    expect(list[NONE].pinName).toBeNull();
  });

  it("fails when snapshot is not pinned", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001");

    const { exitCode, stderr } = runCli(["snapshot", "unpin", id], tmpRoot);

    expect(exitCode).not.toBe(NONE);
    expect(stderr).toContain("not pinned");
  });
});

describe("kural snapshot delete", () => {
  it("deletes a snapshot by ID", async () => {
    tmpRoot = createTmpRoot();
    const id = await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001");
    await seedSnapshot(tmpRoot, "main", TS_BASE + TS_STEP, "bbb0001");

    const { stdout, exitCode } = runCli(["snapshot", "delete", id], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("Deleted");

    const list = listSnapshots(tmpRoot);
    expect(list).toHaveLength(ONE);
    expect(list[NONE].snapshotId).not.toBe(id);
  });

  it("deletes a snapshot by pin name", async () => {
    tmpRoot = createTmpRoot();
    await seedSnapshot(tmpRoot, "main", TS_BASE, "aaa0001", "old");
    await seedSnapshot(tmpRoot, "main", TS_BASE + TS_STEP, "bbb0001");

    const { exitCode } = runCli(["snapshot", "delete", "old"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const list = listSnapshots(tmpRoot);
    expect(list).toHaveLength(ONE);
  });

  it("fails for a nonexistent snapshot", () => {
    tmpRoot = createTmpRoot();
    const { exitCode, stderr } = runCli(["snapshot", "delete", "fake-id"], tmpRoot);

    expect(exitCode).not.toBe(NONE);
    expect(stderr).toContain("not found");
  });
});
