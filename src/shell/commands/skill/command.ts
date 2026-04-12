/**
 * Defines the CLI argument schema and wires user input
 * into the skill writer pipeline via Clack prompts. It is the only
 * module that speaks the Gunshi command protocol for the skill
 * command — no other module defines its arguments or orchestrates
 * its interactive flow.
 */

import { confirm, intro, isCancel, log, multiselect, outro } from "@clack/prompts";
import { define } from "gunshi";
import { editors } from "./editors.ts";
import { writeSkills } from "./pipeline.ts";

const NONE = 0;

/**
 * Runs the interactive skill flow.
 * @returns a promise that resolves when skill files have been written
 * @kuralCauses prompts user for editor selection and writes skill files to disk
 */
async function handleAddSkill(): Promise<void> {
  const root = process.cwd();

  intro("Add kural skill to your editor");

  const selected = await multiselect({
    message: "Which editors do you use?",
    options: editors.map((e) => ({ value: e.value, label: e.label })),
    required: true,
  });

  if (isCancel(selected)) {
    outro("Cancelled.");
    return;
  }

  const chosen = editors.filter((e) => selected.includes(e.value));

  const proceed = await confirm({
    message: `Write kural-audit skill to ${String(chosen.length)} editor(s)?`,
  });

  if (isCancel(proceed) || !proceed) {
    outro("Cancelled.");
    return;
  }

  const results = writeSkills(root, chosen);

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  for (const r of ok) {
    log.success(`${r.editor} → ${r.path}`);
  }

  for (const r of failed) {
    log.error(`${r.editor} → ${r.error}`);
  }

  outro(
    failed.length === NONE
      ? "Done! Skill files written."
      : `Done with ${String(failed.length)} error(s).`,
  );
}

export default define({
  name: "skill",
  description: "Add kural skills to your AI code editor",
  args: {},
  run: async () => {
    await handleAddSkill();
  },
});
