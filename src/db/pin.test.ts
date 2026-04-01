import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeSnapshot, getHistorySnapshots, openSnapshot } from "./snapshot.ts";
import { deleteSnapshot, pinSnapshot, unpinSnapshot } from "./pin.ts";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const NONE = 0;
const ONE = 1;
const TWO = 2;
const BRANCH = "test-branch";
const TS_BASE = 1700000000000;
const TS_STEP = 1000;

/** Creates a unique temp directory for each test. */
function makeTmpRoot(): string {
  const root = join(
    tmpdir(),
    `kural-pin-${String(Date.now())}-${String(Math.random()).slice(TWO)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

/** Creates a snapshot in history with the given timestamp. */
async function createHistorySnapshot(
  root: string,
  branch: string,
  timestamp: number,
  commitHash: string,
): Promise<string> {
  const histDir = join(root, ".kural-db", branch, "history");
  mkdirSync(histDir, { recursive: true });
  const snapshotId = `${String(timestamp)}-${commitHash}`;
  const dbPath = join(histDir, `${snapshotId}.db`);
  const snapshot = await openSnapshot(dbPath);
  const tx = snapshot.collections.metadata.insert([
    { key: "created_at", value: String(timestamp) },
    { key: "commit_hash", value: commitHash },
  ]);
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

describe("pinSnapshot", () => {
  it("assigns a pin name to a snapshot", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    await pinSnapshot(tmpRoot, BRANCH, id, "baseline");

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots[NONE].pinName).toBe("baseline");
  });

  it("moves pin from one snapshot to another when name already exists", async () => {
    tmpRoot = makeTmpRoot();
    const id1 = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");
    const id2 = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE + TS_STEP, "bbb0001");

    await pinSnapshot(tmpRoot, BRANCH, id1, "release");
    await pinSnapshot(tmpRoot, BRANCH, id2, "release");

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    const first = snapshots.find((s) => s.snapshotId === id1);
    const second = snapshots.find((s) => s.snapshotId === id2);
    expect(first?.pinName).toBeUndefined();
    expect(second?.pinName).toBe("release");
  });

  it("replaces existing pin name on the same snapshot", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    await pinSnapshot(tmpRoot, BRANCH, id, "old-name");
    await pinSnapshot(tmpRoot, BRANCH, id, "new-name");

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots[NONE].pinName).toBe("new-name");
  });

  it("throws when snapshot is not found", async () => {
    tmpRoot = makeTmpRoot();
    await expect(pinSnapshot(tmpRoot, BRANCH, "nonexistent", "name")).rejects.toThrow(
      "Snapshot not found",
    );
  });

  it("resolves target by pin name", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    await pinSnapshot(tmpRoot, BRANCH, id, "first-name");
    await pinSnapshot(tmpRoot, BRANCH, "first-name", "second-name");

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots[NONE].pinName).toBe("second-name");
  });
});

describe("unpinSnapshot", () => {
  it("removes the pin from a snapshot", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");
    await pinSnapshot(tmpRoot, BRANCH, id, "to-remove");

    await unpinSnapshot(tmpRoot, BRANCH, id);

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots[NONE].pinName).toBeUndefined();
  });

  it("resolves by pin name", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");
    await pinSnapshot(tmpRoot, BRANCH, id, "my-pin");

    await unpinSnapshot(tmpRoot, BRANCH, "my-pin");

    const snapshots = getHistorySnapshots(tmpRoot, BRANCH);
    expect(snapshots[NONE].pinName).toBeUndefined();
  });

  it("throws when snapshot is not found", async () => {
    tmpRoot = makeTmpRoot();
    await expect(unpinSnapshot(tmpRoot, BRANCH, "nonexistent")).rejects.toThrow(
      "Snapshot not found",
    );
  });

  it("throws when snapshot is not pinned", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    await expect(unpinSnapshot(tmpRoot, BRANCH, id)).rejects.toThrow("is not pinned");
  });
});

describe("deleteSnapshot", () => {
  it("removes the snapshot file from disk", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");

    const before = getHistorySnapshots(tmpRoot, BRANCH);
    expect(before).toHaveLength(ONE);

    deleteSnapshot(tmpRoot, BRANCH, id);

    const after = getHistorySnapshots(tmpRoot, BRANCH);
    expect(after).toHaveLength(NONE);
  });

  it("resolves by pin name", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");
    await pinSnapshot(tmpRoot, BRANCH, id, "delete-me");

    deleteSnapshot(tmpRoot, BRANCH, "delete-me");

    const after = getHistorySnapshots(tmpRoot, BRANCH);
    expect(after).toHaveLength(NONE);
  });

  it("deletes pinned snapshots", async () => {
    tmpRoot = makeTmpRoot();
    const id = await createHistorySnapshot(tmpRoot, BRANCH, TS_BASE, "aaa0001");
    await pinSnapshot(tmpRoot, BRANCH, id, "pinned");

    deleteSnapshot(tmpRoot, BRANCH, id);

    const after = getHistorySnapshots(tmpRoot, BRANCH);
    expect(after).toHaveLength(NONE);
  });

  it("throws when snapshot is not found", () => {
    tmpRoot = makeTmpRoot();
    expect(() => {
      deleteSnapshot(tmpRoot, BRANCH, "nonexistent");
    }).toThrow("Snapshot not found");
  });
});
