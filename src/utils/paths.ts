/**
 * The shortener. Converts absolute filesystem paths into relative display
 * strings. It is the only module that owns path-to-label conversion — no
 * other module decides how paths appear in terminal output.
 * @kuralUtil
 */

import { basename, relative } from "node:path";

/**
 * Converts an absolute path to a root-relative display path.
 * @param fullPath - Absolute path to shorten
 * @param rootPath - Root directory path to relativize against
 * @returns Relative path, or the basename if at root level
 * @kuralPure
 */
function shortPath(fullPath: string, rootPath: string | null): string {
  if (rootPath !== null) {
    return relative(rootPath, fullPath) || basename(fullPath);
  }
  return fullPath;
}

export { shortPath };
