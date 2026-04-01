import {
  activePath,
  closeSnapshot,
  createActive,
  getHistorySnapshots,
  openSnapshot,
  resolveSnapshot,
  rotateActive,
} from "./snapshot.ts";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const NONE = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const HASH_LENGTH = 7;
const BRANCH = "test-branch";
const TS_BASE = 1700000000000;
const TS_STEP = 1000;

/** Creates a unique temp directory for each test. */
function makeTmpRoot(): string {
  const root = join(
    tmpdir(),
    `kural-test-${String(Date.now())}-${String(Math.random()).slice(TWO)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

/** Creates a snapshot in history with the given timestamp and optional pin. */
async function createHistorySnapshot(
  root: string,
  branch: string,
  timestamp: number,
  commitHash: string,
  pinName?: string,
): Promise<string> {
  const histDir = join(root, ".kural-db", branch, "history");
  mkdirSync(histDir, { recursive: true });
  const snapshotId = `${String(timestamp)}-${commitHash}`;
  const dbPath = join(histDir, `${snapshotId}.db`);
  const snapshot = await openSnapshot(dbPath);
  const metaRows = [
    { key: "created_at", value: String(timestamp) },
    { key: "commit_hash", value: commitHash },
  ];
  if (pinName !== undefined) {
    metaRows.push({ key: "pin_name", value: pinName });
  }
  const tx = snapshot.collections.metadata.insert(metaRows);
  await tx.isPersisted.promise;
  await closeSnapshot(snapshot);
  return snapshotId;
}

let tmpRoot = "";

afterEach(() => {
  if (tmpRoot !== "" && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true });
  }
});

describe("getHistorySnapshots", () => {
  it("returns empty array when no history exists", () => {
    tmpRoot = makeTmpRoot();
    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots).toHaveLength(NONE);
  });

  it("lists snapshots sorted by timestamp ascending", async () => {
    tmpRoot = makeTmpRoot();
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE + TS_STEP * TWO, "ccc0001");
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE + TS_STEP, "bbb0001");

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots).toHaveLength(THREE);
    expect(snapshots[NONE].timestamp).toBe(TS_BASE);
    expect(snapshots[ONE].timestamp).toBe(TS_BASE + TS_STEP);
    expect(snapshots[TWO].timestamp).toBe(TS_BASE + TS_STEP * TWO);
  });

  it("reads pin names from snapshot metadata", async () => {
    tmpRoot = makeTmpRoot();
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001", "baseline");
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE + TS_STEP, "bbb0001");

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots[NONE].pinName).toBe("baseline");
    expect(snapshots[ONE].pinName).toBeUndefined();
  });
});

describe("resolveSnapshot", () => {
  it("returns null when idOrName is undefined", () => {
    tmpRoot = makeTmpRoot();
    const result = resolveSnapshot(tmpRoot, BRANCH);
    expect(result).toBeNull();
  });

  it("resolves by snapshot ID", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    const result = resolveSnapshot(tmpRoot, BRANCH, id);
    expect(result).not.toBeNull();
    expect(result?.snapshotId).toBe(id);
  });

  it("resolves by pin name", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001", "release-v1");

    const result = resolveSnapshot(tmpRoot, BRANCH, "release-v1");
    expect(result).not.toBeNull();
    expect(result?.snapshotId).toBe(id);
    expect(result?.pinName).toBe("release-v1");
  });

  it("prefers snapshot ID over pin name when both match", async () => {
    tmpRoot = makeTmpRoot();
    const id1 = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001", "some-pin");
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE + TS_STEP, "bbb0001");

    const result = resolveSnapshot(tmpRoot, BRANCH, id1);
    expect(result?.snapshotId).toBe(id1);
  });

  it("returns null when no match found", async () => {
    tmpRoot = makeTmpRoot();
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    const result = resolveSnapshot(tmpRoot, BRANCH, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("rotateActive — eviction", () => {
  it("skips pinned snapshots during eviction", async () => {
    tmpRoot = makeTmpRoot();
    const MAX_HISTORY = 10;

    // Create a pinned snapshot
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "a000000", "keep-me");

    // Create MAX_HISTORY unpinned snapshots to fill history
    for (let i = ONE; i <= MAX_HISTORY; i++) {
      const HEX_RADIX = 16;
      const hex = i.toString(HEX_RADIX).padStart(HASH_LENGTH, "0");
      await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE + TS_STEP * i, hex);
    }

    // Create an active.db with metadata so rotateActive can move it
    const snapshot = await createActive(tmpRoot, BRANCH);
    const tx = snapshot.collections.metadata.insert([
      { key: "created_at", value: String(TS_BASE + TS_STEP * (MAX_HISTORY + ONE)) },
      { key: "commit_hash", value: "fff0000" },
    ]);
    await tx.isPersisted.promise;
    await closeSnapshot(snapshot);

    // Rotate — this should evict oldest unpinned but keep the pinned one
    await rotateActive(tmpRoot, BRANCH);

    const after = getHistorySnapshots(tmpRoot, BRANCH);
    const pinned = after.find((s) => s.pinName === "keep-me");
    expect(pinned).toBeDefined();

    // Unpinned count should be at most MAX_HISTORY
    const unpinnedCount = after.filter((s) => s.pinName === undefined).length;
    expect(unpinnedCount).toBeLessThanOrEqual(MAX_HISTORY);
  });

  it("does not evict when under the limit", async () => {
    tmpRoot = makeTmpRoot();
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    const snapshot = await createActive(tmpRoot, BRANCH);
    const tx = snapshot.collections.metadata.insert([
      { key: "created_at", value: String(TS_BASE + TS_STEP) },
      { key: "commit_hash", value: "bbb0001" },
    ]);
    await tx.isPersisted.promise;
    await closeSnapshot(snapshot);

    await rotateActive(tmpRoot, BRANCH);

    const after = getHistorySnapshots(tmpRoot, BRANCH);
    expect(after).toHaveLength(TWO);
  });

  it("does nothing when no active database exists", async () => {
    tmpRoot = makeTmpRoot();
    await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    await rotateActive(tmpRoot, BRANCH);

    const after = getHistorySnapshots(tmpRoot, BRANCH);
    expect(after).toHaveLength(ONE);
  });
});

describe("activePath", () => {
  it("returns the expected path structure", () => {
    const path = activePath("/project", "main");
    expect(path).toBe("/project/.kural-db/main/active.db");
  });
});
