#!/usr/bin/env node

import { cli } from "gunshi";
import main from "./commands/main.ts";

await cli(process.argv.slice(2), main, {
  name: "kural",
  version: "0.0.0",
});
