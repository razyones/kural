/**
 * The registry. Defines the snapshot command group that nests all
 * snapshot management subcommands. It is the only module that wires
 * the snapshot subcommand tree — no other module defines the snapshot
 * parent command.
 */

import { define } from "gunshi";
import deleteCmd from "./delete/command.ts";
import generate from "./generate/command.ts";
import list from "./list/command.ts";
import pin from "./pin/command.ts";
import unpin from "./unpin/command.ts";

export default define({
  name: "snapshot",
  description: "Manage codebase snapshots",
  subCommands: { generate, list, pin, unpin, delete: deleteCmd },
  run: () => {
    // Help with COMMANDS section is shown automatically when omitted
  },
});
