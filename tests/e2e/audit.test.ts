/**
 * E2E tests for `kural audit`.
 * Spawns the built CLI against a temp directory with a fully seeded
 * active snapshot containing files, functions, types, and directories.
 */

import type { DirectoryRow, FileRow, FunctionRow, TypeRow } from "../../src/db/schemas.ts";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  cleanupTmpRoot,
  createTmpRoot,
  extractJson,
  runCli,
  seedFullActiveSnapshot,
} from "./helpers.ts";
import type { SeedData } from "./helpers.ts";

const NONE = 0;

/** Embedding component values — reuse across all seeded rows. */
const E0 = 0.0;
const E005 = 0.05;
const E01 = 0.1;
const E015 = 0.15;
const E02 = 0.2;
const E025 = 0.25;
const E03 = 0.3;
const E04 = 0.4;
const E05 = 0.5;
const E06 = 0.6;
const E07 = 0.7;
const E075 = 0.75;
const E08 = 0.8;
const E085 = 0.85;
const E09 = 0.9;

const ONE_PARAM = 1;

/**
 * Builds a minimal but structurally valid project for the audit pipeline.
 * Two files under one directory, each with one function and sharing a type.
 * Small enough that most audits won't trigger (under minGroup=3),
 * letting us test the wiring without engineering specific findings.
 */
function makeProjectData(root: string): SeedData {
  const srcPath = `${root}/src`;

  const directories: DirectoryRow[] = [
    {
      path: srcPath,
      name: "src",
      description: "Application source code",
      children: [`${srcPath}/app.ts`, `${srcPath}/utils.ts`],
      identityEmbedding: [E09, E01, E01, E0],
      leafEmbedding: [E08, E02, E01, E01],
      residuals: [],
    },
  ];

  const files: FileRow[] = [
    {
      path: `${srcPath}/app.ts`,
      name: "app.ts",
      description: "Main application entry point",
      identityEmbedding: [E08, E03, E01, E0],
      leafEmbedding: [E07, E04, E02, E01],
      importsInternal: [`${srcPath}/utils.ts`],
      importsExternal: [],
      residuals: [],
    },
    {
      path: `${srcPath}/utils.ts`,
      name: "utils.ts",
      description: "Utility helpers for string formatting",
      identityEmbedding: [E01, E08, E03, E0],
      leafEmbedding: [E02, E07, E04, E01],
      importsInternal: [],
      importsExternal: [],
      residuals: [],
    },
  ];

  const functions: FunctionRow[] = [
    {
      path: `${srcPath}/app.ts`,
      name: "main",
      description: "Starts the application",
      params: ["string"],
      paramNames: ["config"],
      returnsType: "void",
      exported: true,
      pure: false,
      util: false,
      helper: false,
      residuals: [],
      calls: ["formatName"],
      identityEmbedding: [E085, E02, E01, E005],
      leafEmbedding: [E075, E03, E02, E01],
      documentedParams: ONE_PARAM,
      hasReturnDoc: false,
    },
    {
      path: `${srcPath}/utils.ts`,
      name: "formatName",
      description: "Formats a user name for display",
      params: ["string"],
      paramNames: ["name"],
      returnsType: "string",
      exported: true,
      pure: true,
      util: false,
      helper: false,
      residuals: [],
      calls: [],
      identityEmbedding: [E015, E085, E02, E005],
      leafEmbedding: [E025, E075, E03, E01],
      documentedParams: ONE_PARAM,
      hasReturnDoc: true,
    },
  ];

  const types: TypeRow[] = [
    {
      path: `${srcPath}/app.ts`,
      name: "AppConfig",
      description: "Configuration options for the application",
      fields: { name: "string", debug: "boolean" },
      exported: true,
      refs: [],
      util: false,
      helper: false,
      residuals: [],
      identityEmbedding: [E07, E01, E05, E01],
      leafEmbedding: [E06, E02, E05, E02],
    },
  ];

  return { directories, files, functions, types };
}

let tmpRoot = "";

afterEach(() => {
  cleanupTmpRoot(tmpRoot);
  tmpRoot = "";
});

describe("kural audit", () => {
  it("runs audits on a seeded active snapshot", async () => {
    tmpRoot = createTmpRoot();
    await seedFullActiveSnapshot(tmpRoot, "main", makeProjectData(tmpRoot));

    const { stdout, exitCode } = runCli(["audit"], tmpRoot);

    expect(exitCode).toBe(NONE);
    expect(stdout).toContain("audit");
  });

  it("outputs JSON with --json flag", async () => {
    tmpRoot = createTmpRoot();
    await seedFullActiveSnapshot(tmpRoot, "main", makeProjectData(tmpRoot));

    const { stdout, exitCode } = runCli(["audit", "--json"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{
      snapshot: string;
      createdAt: string;
      total: number;
      audits: Array<{ name: string; title: string; count: number }>;
    }>(stdout);
    expect(parsed.snapshot).toContain("active.db");
    expect(parsed.audits).toBeDefined();
    expect(typeof parsed.total).toBe("number");
  });

  it("filters audits by category with --filter", async () => {
    tmpRoot = createTmpRoot();
    await seedFullActiveSnapshot(tmpRoot, "main", makeProjectData(tmpRoot));

    const { stdout, exitCode } = runCli(["audit", "--json", "-f", "duplicates"], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{
      audits: Array<{ name: string; title: string }>;
    }>(stdout);
    for (const audit of parsed.audits) {
      expect(audit.title.toLowerCase()).toContain("duplicat");
    }
  });

  it("disables specific audits with --disable", async () => {
    tmpRoot = createTmpRoot();
    await seedFullActiveSnapshot(tmpRoot, "main", makeProjectData(tmpRoot));

    // Get the full audit list first
    const { stdout: fullOut } = runCli(["audit", "--json"], tmpRoot);
    const full = extractJson<{ audits: Array<{ name: string }> }>(fullOut);
    const allNames = full.audits.map((a) => a.name);

    // Disable the first audit (may have hyphens) and verify it's absent
    const toDisable = allNames[NONE];
    const { stdout, exitCode } = runCli(["audit", "--json", "-d", toDisable], tmpRoot);

    expect(exitCode).toBe(NONE);
    const parsed = extractJson<{ audits: Array<{ name: string }> }>(stdout);
    const remaining = parsed.audits.map((a) => a.name);
    expect(remaining).not.toContain(toDisable);
  });

  it("fails when no active snapshot exists", () => {
    tmpRoot = createTmpRoot();
    const { exitCode, stderr } = runCli(["audit"], tmpRoot);

    expect(exitCode).not.toBe(NONE);
    expect(stderr).toContain("No active database found");
  });
});
