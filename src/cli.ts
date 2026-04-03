#!/usr/bin/env node

/**
 * The entry point. Bootstraps the CLI router, loads environment variables,
 * and dispatches to subcommands. It is the only module that wires the
 * top-level command tree — no other module touches process argv.
 * @kuralBound inward
 */

import audit from "./commands/audit/command.ts";
import { cli } from "gunshi";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import score from "./commands/score/command.ts";
import snapshot from "./commands/snapshot/command.ts";

const ARGV_START = 2;

if (existsSync(".env")) {
  try {
    loadEnvFile(".env");
  } catch (err) {
    console.error(`Warning: failed to load .env file: ${err instanceof Error ? err.message : err}`);
  }
}

await cli(process.argv.slice(ARGV_START), snapshot, {
  name: "kural",
  version: "0.0.0",
  subCommands: { audit, score },
});
