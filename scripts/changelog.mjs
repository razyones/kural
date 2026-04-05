/**
 * Generates CHANGELOG.md from git history.
 *
 * Groups commits by version tag (newest first), then by conventional commit type.
 * Untagged commits after the latest tag appear under "Unreleased".
 *
 * When called from the release script, accepts an optional pending version
 * via --pending flag to label the unreleased section with that version.
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const TYPE_LABELS = {
  feat: "Features",
  fix: "Fixes",
  docs: "Documentation",
  refactor: "Refactoring",
  perf: "Performance",
  test: "Tests",
  build: "Build",
  ci: "CI",
  style: "Styles",
  chore: "Chores",
  revert: "Reverts",
};

const TYPE_ORDER = Object.keys(TYPE_LABELS);

const DATE_END = 10;
const FIRST = 0;
const NEXT = 1;
const NOT_FOUND = -1;
const NONE = 0;

const MATCH_TYPE = 1;
const MATCH_SCOPE = 2;
const MATCH_DESC = 3;

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
}

function today() {
  return new Date().toISOString().slice(FIRST, DATE_END);
}

function parseCommits(range) {
  const arg = range ?? "";
  const raw = git(`log --pretty=format:"%s|%h" ${arg}`);
  if (!raw) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => {
      const sep = line.lastIndexOf("|");
      if (sep < NOT_FOUND + NEXT) {
        return null;
      }
      const msg = line.slice(FIRST, sep);
      const hash = line.slice(sep + NEXT);
      const match = msg.match(/^(\w+)(?:\(([^)]+)\))?: (.+)/);
      if (!match) {
        return null;
      }
      return {
        type: match[MATCH_TYPE],
        scope: match[MATCH_SCOPE] ?? null,
        desc: match[MATCH_DESC],
        hash,
      };
    })
    .filter(Boolean);
}

function formatSection(commits) {
  const grouped = {};
  for (const c of commits) {
    const key = TYPE_LABELS[c.type] ? c.type : "other";
    (grouped[key] ??= []).push(c);
  }

  const lines = [];
  for (const type of TYPE_ORDER) {
    const group = grouped[type];
    if (!group?.length) {
      continue;
    }
    lines.push(`### ${TYPE_LABELS[type]}`);
    lines.push("");
    for (const c of group) {
      const prefix = c.scope ? `**${c.scope}:** ` : "";
      lines.push(`- ${prefix}${c.desc} (\`${c.hash}\`)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function getTags() {
  const raw = git("tag -l v* --sort=-version:refname");
  return raw ? raw.split("\n").filter(Boolean) : [];
}

function getTagDate(tag) {
  return git(`log -1 --format=%as ${tag}`);
}

function getPendingVersion() {
  const flag = process.argv.indexOf("--pending");
  if (flag >= NONE && process.argv[flag + NEXT]) {
    return process.argv[flag + NEXT];
  }
  return null;
}

function buildChangelog() {
  const tags = getTags();
  const pending = getPendingVersion();
  const sections = ["# Changelog", ""];

  if (tags.length === NONE) {
    const commits = parseCommits("");
    if (commits.length > NONE) {
      const heading = pending ? `## ${pending} — ${today()}` : "## Unreleased";
      sections.push(heading);
      sections.push("");
      sections.push(formatSection(commits));
    }
  } else {
    const unreleased = parseCommits(`${tags[FIRST]}..HEAD`);
    if (unreleased.length > NONE) {
      const heading = pending ? `## ${pending} — ${today()}` : "## Unreleased";
      sections.push(heading);
      sections.push("");
      sections.push(formatSection(unreleased));
    }

    for (let i = FIRST; i < tags.length; i++) {
      const tag = tags[i];
      const date = getTagDate(tag);
      const range = i + NEXT < tags.length ? `${tags[i + NEXT]}..${tag}` : tag;
      const commits = parseCommits(range);

      sections.push(`## ${tag} — ${date}`);
      sections.push("");
      if (commits.length > NONE) {
        sections.push(formatSection(commits));
      }
    }
  }

  return (
    sections
      .join("\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

const changelog = buildChangelog();
writeFileSync("CHANGELOG.md", changelog);

const pending = getPendingVersion();
if (pending) {
  console.log(`CHANGELOG.md generated for ${pending}`);
} else {
  console.log("CHANGELOG.md generated");
}
