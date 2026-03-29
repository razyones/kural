#!/usr/bin/env node

import { cli } from "gunshi";
import main from "./commands/main.ts";

const ARGV_START = 2;

await cli(process.argv.slice(ARGV_START), main, {
  name: "kural",
  version: "0.0.0",
});
