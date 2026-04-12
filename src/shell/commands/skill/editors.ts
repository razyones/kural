/**
 * Defines every supported editor's skill file layout —
 * path patterns, format adapters, and metadata conventions. It is
 * the only module that knows where each editor stores its instruction
 * files and how to transform shared skill content into editor-native
 * format.
 */

const FIRST = 0;
const SKILL_DIR = "kural-audit";
const SKILL_FILE = "SKILL.md";

/**
 * Removes YAML frontmatter delimited by triple dashes from markdown content.
 * @param content - raw markdown string potentially starting with frontmatter
 * @returns the content without the leading frontmatter block
 * @kuralPure
 */
function stripYamlFrontmatter(content: string): string {
  const match = /^---\n[\s\S]*?\n---\n/.exec(content);
  if (match === null) {
    return content;
  }
  return content.slice(match[FIRST].length).trimStart();
}

/**
 * A target editor that kural can write skills to.
 */
type Editor = {
  /** Display label for the multiselect prompt. */
  label: string;
  /** Short identifier. */
  value: string;
  /** Relative path from project root where the skill file is written. */
  path: string;
  /**
   * Transforms the SKILL.md content and reference content into the
   * editor-native format.
   * @param skill - raw SKILL.md content including YAML frontmatter
   * @param reference - raw reference.md content
   * @returns the final file content to write
   */
  transform: (skill: string, reference: string) => string;
};

/**
 * Builds plain markdown by stripping frontmatter and merging both files.
 * @param skill - raw SKILL.md content
 * @param reference - raw reference.md content
 * @returns plain markdown content without YAML frontmatter
 * @kuralPure
 */
function buildPlainMarkdown(skill: string, reference: string): string {
  const body = stripYamlFrontmatter(skill);
  const ref = stripYamlFrontmatter(reference);
  return `${body}\n\n${ref}\n`;
}

/**
 * Creates an editor entry that writes a plain markdown SKILL.md into
 * the editor's skills directory.
 * @param label - display name for the prompt
 * @param value - short identifier
 * @param skillsDir - relative path to the editor's skills root
 * @returns an Editor definition
 * @kuralPure
 */
function skillsDirEditor(label: string, value: string, skillsDir: string): Editor {
  return {
    label,
    value,
    path: `${skillsDir}/${SKILL_DIR}/${SKILL_FILE}`,
    transform: buildPlainMarkdown,
  };
}

/**
 * All supported editors and their skill file conventions.
 * Aligned with Vite Plus editor support.
 * @kuralPure
 */
const editors: Editor[] = [
  {
    label: "Claude Code",
    value: "claude",
    path: `.claude/skills/${SKILL_DIR}/${SKILL_FILE}`,
    transform: (skill: string, _reference: string) => skill,
  },
  skillsDirEditor("Cursor", "cursor", ".agents/skills"),
  skillsDirEditor("Windsurf", "windsurf", ".windsurf/skills"),
  skillsDirEditor("Codex", "codex", ".agents/skills"),
  skillsDirEditor("Gemini CLI", "gemini", ".agents/skills"),
  skillsDirEditor("GitHub Copilot", "copilot", ".agents/skills"),
  skillsDirEditor("Cline", "cline", ".cline/skills"),
  skillsDirEditor("Amp", "amp", ".agents/skills"),
  skillsDirEditor("Roo Code", "roo", ".roo/skills"),
  skillsDirEditor("Kilo Code", "kilo", ".kilocode/skills"),
  skillsDirEditor("Continue", "continue", ".continue/skills"),
  skillsDirEditor("Goose", "goose", ".goose/skills"),
  skillsDirEditor("OpenCode", "opencode", ".agents/skills"),
  skillsDirEditor("Trae", "trae", ".trae/skills"),
  skillsDirEditor("Junie", "junie", ".junie/skills"),
  skillsDirEditor("Kiro CLI", "kiro", ".kiro/skills"),
  skillsDirEditor("Zencoder", "zencoder", ".zencoder/skills"),
  skillsDirEditor("Qwen Code", "qwen", ".qwen/skills"),
];

export type { Editor };
export { editors };
