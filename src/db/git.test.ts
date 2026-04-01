import { buildSnapshotId, currentBranch, currentCommitHash } from "./git.ts";
import { describe, expect, it } from "vite-plus/test";

const HASH_LENGTH = 7;
const NONE = 0;
const SAMPLE_TIMESTAMP = 1700000000000;

describe("buildSnapshotId", () => {
  it("formats timestamp and hash with a hyphen", () => {
    const id = buildSnapshotId(SAMPLE_TIMESTAMP, "abc1234");
    expect(id).toBe("1700000000000-abc1234");
  });

  it("converts numeric timestamp to string", () => {
    const id = buildSnapshotId(NONE, "0000000");
    expect(id).toBe("0-0000000");
  });
});

describe("currentBranch", () => {
  it("returns a non-empty string", () => {
    const branch = currentBranch();
    expect(branch.length).toBeGreaterThan(NONE);
  });
});

describe("currentCommitHash", () => {
  it("returns a 7-character hex string", () => {
    const hash = currentCommitHash();
    expect(hash).toMatch(/^[a-f0-9]{7}$/);
    expect(hash).toHaveLength(HASH_LENGTH);
  });
});
