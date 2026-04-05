/**
 * Release script: generates changelog, commits it, and tags the release.
 *
 * Usage: node scripts/release.mjs <version>
 * Example: node scripts/release.mjs v0.1.0
 *
 * Flow:
 *   1. Validate the version argument
 *   2. Generate CHANGELOG.md with the pending version heading
 *   3. Stage and commit CHANGELOG.md
 *   4. Create an annotated tag on that commit
 */

import { execSync } from "node:child_process";

const VERSION_ARG = 2;
const EXIT_FAILURE = 1;

function git(cmd) {
  execSync(`git ${cmd}`, { stdio: "inherit" });
}

function gitQuiet(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
}

const version = process.argv[VERSION_ARG];

if (!version) {
  console.error("Usage: node scripts/release.mjs <version>");
  console.error("Example: node scripts/release.mjs v0.1.0");
  process.exit(EXIT_FAILURE);
}

if (!/^v\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid version format: ${version}`);
  console.error("Expected: v<major>.<minor>.<patch> (e.g., v0.1.0, v1.0.0-beta.1)");
  process.exit(EXIT_FAILURE);
}

const status = gitQuiet("status --porcelain");
if (status) {
  console.error("Working tree is dirty. Commit or stash changes before releasing.");
  process.exit(EXIT_FAILURE);
}

const existing = gitQuiet("tag -l " + version);
if (existing) {
  console.error(`Tag ${version} already exists.`);
  process.exit(EXIT_FAILURE);
}

console.log(`\nGenerating changelog for ${version}...`);
execSync(`node scripts/changelog.mjs --pending ${version}`, { stdio: "inherit" });

console.log("\nCommitting CHANGELOG.md...");
git("add CHANGELOG.md");
git(`commit -m "chore(release): ${version}"`);

console.log(`\nTagging ${version}...`);
git(`tag -a ${version} -m "${version}"`);

console.log(`\nReleased ${version}`);
console.log(`  → git push origin ${gitQuiet("branch --show-current")} --tags`);
