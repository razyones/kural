#!/usr/bin/env node

import { cli } from "gunshi";
import { existsSync } from "node:fs";
import generate from "./commands/generate/command.ts";
import { loadEnvFile } from "node:process";

const ARGV_START = 2;

if (existsSync(".env")) {
  loadEnvFile(".env");
}

await cli(process.argv.slice(ARGV_START), generate, {
  name: "kural",
  version: "0.0.0",
});
