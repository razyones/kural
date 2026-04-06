/**
 * The writer. Reads the shared skill source files and writes
 * editor-specific versions to disk. It is the only module that
 * performs file I/O for the skill command — no other module
 * reads skill sources or writes editor output.
 * @kuralBound outward
 */

import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Editor } from "./editors.ts";

const SKILL_SOURCE = ".claude/skills/resolve-audit/SKILL.md";
const REFERENCE_SOURCE = ".claude/skills/resolve-audit/reference.md";

/** Result of writing a single editor skill file. */
type WriteResult = {
  editor: string;
  path: string;
  ok: boolean;
  error?: string;
};

/**
 * Reads the shared skill sources and writes editor-specific files.
 * @param root - absolute path to the project root
 * @param selected - editors chosen by the user
 * @returns an array of write results, one per editor
 * @kuralCauses reads skill source files and writes editor-specific skill files to disk
 */
function writeSkills(root: string, selected: Editor[]): WriteResult[] {
  const skillPath = resolve(root, SKILL_SOURCE);
  const referencePath = resolve(root, REFERENCE_SOURCE);

  const skill = readFileSync(skillPath, "utf-8");
  const reference = readFileSync(referencePath, "utf-8");

  const results: WriteResult[] = [];
  const written = new Set<string>();

  for (const editor of selected) {
    if (written.has(editor.path)) {
      results.push({ editor: editor.label, path: editor.path, ok: true });
      continue;
    }
    const outPath = resolve(root, editor.path);
    try {
      mkdirSync(dirname(outPath), { recursive: true });
      const content = editor.transform(skill, reference);
      writeFileSync(outPath, content, "utf-8");
      written.add(editor.path);
      results.push({ editor: editor.label, path: editor.path, ok: true });
    } catch (err) {
      results.push({
        editor: editor.label,
        path: editor.path,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export type { WriteResult };
export { writeSkills };
