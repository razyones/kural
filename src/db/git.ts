/**
 * Reads git state — current branch and commit hash — so
 * snapshot IDs can be tied to the code they were generated from. It is
 * the only module that shells out to git — no other module runs git
 * commands.
 */

import { execSync } from "node:child_process";

const HASH_LENGTH = 7;

/**
 * Detects the current git branch name.
 * Falls back to "main" if not in a git repo.
 * @returns The current git branch name, or "main" as fallback
 * @kuralPatterns gitInfo
 * @kuralCauses runs git rev-parse via execSync
 */
function currentBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "main";
  }
}

/**
 * Gets the short commit hash of HEAD.
 * Falls back to "0000000" if not in a git repo.
 * @returns The short commit hash of HEAD, or "0000000" as fallback
 * @kuralPatterns gitInfo
 * @kuralCauses runs git rev-parse via execSync
 */
function currentCommitHash(): string {
  try {
    return execSync(`git rev-parse --short=${String(HASH_LENGTH)} HEAD`, {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "0000000";
  }
}

/**
 * Builds a snapshot ID from timestamp and commit hash.
 * @param timestamp - Unix timestamp in milliseconds
 * @param commitHash - Short git commit hash
 * @returns Snapshot ID in the format "<timestamp>-<commitHash>"
 * @kuralPure
 */
function buildSnapshotId(timestamp: number, commitHash: string): string {
  return `${String(timestamp)}-${commitHash}`;
}

export { buildSnapshotId, currentBranch, currentCommitHash };
