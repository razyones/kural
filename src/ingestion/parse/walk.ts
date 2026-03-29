/**
 * The scout. Discovers which .ts files and directories exist under a root path.
 * It is the only module that touches the filesystem for directory enumeration —
 * no other part of the parse pipeline decides what to read.
 * @kuralResidual outliers [14d4edea]
 */

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

/** Collected file and directory paths from a directory walk. */
type WalkResult = {
  root: string;
  files: string[];
  directories: string[];
};

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "__fixtures__",
  "__tests__",
  "__mocks__",
]);

/**
 * Recursively walks a directory and collects all .ts files and subdirectories.
 * Skips node_modules, dist, .git, and hidden directories.
 * @param dir - Absolute path to the root directory to walk
 * @returns Collected .ts file paths, subdirectory paths, and the root path
 * @kuralCauses Reads the filesystem to discover .ts files and directories
 */
async function walk(dir: string): Promise<WalkResult> {
  const files: string[] = [];
  const directories: string[] = [];

  async function traverse(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          directories.push(fullPath);
          await traverse(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  }

  await traverse(dir);

  return { root: dir, files, directories };
}

export { walk };
export type { WalkResult };
