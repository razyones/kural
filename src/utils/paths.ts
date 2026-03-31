/**
 * The shortener. Converts absolute filesystem paths into relative display
 * strings. It is the only module that owns path-to-label conversion — no
 * other module decides how paths appear in terminal output.
 * @kuralUtil
 */

import { basename, relative } from "node:path";

const PREFIX_SEP_IDX = 0;
const AFTER_COLON = 1;

/**
 * Strips the kind prefix (dir:, file:, func:, type:) from a node key.
 * @param key - Node key like "file:/abs/path" or "dir:/abs/path"
 * @returns The path portion after the first colon
 * @kuralPatterns pathExtractor
 * @kuralPure
 */
function stripKeyPrefix(key: string): string {
  const idx = key.indexOf(":");
  return idx >= PREFIX_SEP_IDX ? key.slice(idx + AFTER_COLON) : key;
}

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

export { shortPath, stripKeyPrefix };
