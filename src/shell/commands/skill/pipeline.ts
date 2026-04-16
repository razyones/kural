/**
 * Reads the shared skill source files and writes
 * editor-specific versions to disk. It is the only module that
 * performs file I/O for the skill command — no other module
 * reads skill sources or writes editor output.
 */

import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Editor } from "./editors.ts";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const SKILL_DIR = resolve(PKG_ROOT, "skills", "kural-audit");

/** Result of writing a single editor skill file. */
type WriteResult = {
  editor: string;
  path: string;
  ok: boolean;
  error?: string;
};

/**
 * Reads a skill source file with a clear error if missing.
 * @param name - filename within the skill directory
 * @returns the file content as a string
 * @kuralCauses reads a file from the skill directory bundled with the package
 */
function readSkillFile(name: string): string {
  const filePath = resolve(SKILL_DIR, name);
  if (!existsSync(filePath)) {
    throw new Error(
      `Skill file not found: ${filePath}. The kural package may be corrupted — try reinstalling.`,
    );
  }
  return readFileSync(filePath, "utf-8");
}

/**
 * Reads the shared skill sources and writes editor-specific files.
 * @param root - absolute path to the user's project root
 * @param selected - editors chosen by the user
 * @returns an array of write results, one per editor
 * @kuralCauses reads skill source files and writes editor-specific skill files to disk
 */
function writeSkills(root: string, selected: Editor[]): WriteResult[] {
  const skill = readSkillFile("SKILL.md");
  const reference = readSkillFile("reference.md");

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
