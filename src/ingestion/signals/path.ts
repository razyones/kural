/**
 * The compass. Builds path signal strings that anchor a unit's name
 * within the project hierarchy and domain context. It is the only
 * module that constructs path-based context for embedding — no other
 * module turns filesystem position into semantic signal.
 */

import { dirname, relative } from "node:path";

/**
 * Builds a path signal string for a unit.
 * Root units get domain keywords joined with hyphens and a trailing slash.
 * All other units get keywords joined with slashes followed by ancestor path.
 * @param unitPath - Absolute path to the unit
 * @param rootPath - Absolute path to the generation root directory
 * @param domainKeywords - Top domain keywords (already selected)
 * @returns Path signal string for embedding
 * @kuralPure
 */
function buildPathSignal(unitPath: string, rootPath: string, domainKeywords: string[]): string {
  if (unitPath === rootPath) {
    return domainKeywords.join("-") + "/";
  }

  const prefix = domainKeywords.join("/");
  const rel = relative(rootPath, unitPath);
  const parent = dirname(rel);

  if (parent === ".") {
    return prefix + "/";
  }

  return prefix + "/" + parent + "/";
}

export { buildPathSignal };
