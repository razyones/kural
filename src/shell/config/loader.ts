/**
 * The reader. Loads project configuration from kural.config.json on disk.
 * It is the only module that reads the config file — no other module
 * touches the filesystem for configuration.
 */

import { existsSync, readFileSync } from "node:fs";
import type { KuralConfig } from "./schema.ts";
import { join } from "node:path";

const CONFIG_FILENAME = "kural.config.json";

/**
 * Loads project config from kural.config.json in the given root directory.
 * Returns an empty partial config if the file is missing or invalid.
 * @param root - Project root directory (defaults to cwd)
 * @returns Partial config with values from the file
 * @kuralCauses reads kural.config.json from disk
 */
function loadProjectConfig(root: string = process.cwd()): Partial<KuralConfig> {
  const configPath = join(root, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf-8"));
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Partial<KuralConfig>;
    }
    console.error(`Warning: ${CONFIG_FILENAME} does not contain a JSON object — using defaults`);
    return {};
  } catch (err) {
    console.error(
      `Warning: failed to parse ${CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)} — using defaults`,
    );
    return {};
  }
}

export { loadProjectConfig };
