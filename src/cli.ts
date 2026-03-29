#!/usr/bin/env node

import { cli } from "gunshi";
import generate from "./commands/generate/command.ts";

const ARGV_START = 2;

await cli(process.argv.slice(ARGV_START), generate, {
  name: "kural",
  version: "0.0.0",
});
