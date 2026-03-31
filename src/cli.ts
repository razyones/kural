#!/usr/bin/env node

/**
 * The entry point. Bootstraps the CLI router, loads environment variables,
 * and dispatches to subcommands. It is the only module that wires the
 * top-level command tree — no other module touches process argv.
 * @kuralResidual outliers [204b56f5]
 */

import audit from "./commands/audit/command.ts";
import { cli } from "gunshi";
import { existsSync } from "node:fs";
import generate from "./commands/generate/command.ts";
import { loadEnvFile } from "node:process";
import score from "./commands/score/command.ts";

const ARGV_START = 2;

if (existsSync(".env")) {
  loadEnvFile(".env");
}

await cli(process.argv.slice(ARGV_START), generate, {
  name: "kural",
  version: "0.0.0",
  subCommands: { audit, score },
});
