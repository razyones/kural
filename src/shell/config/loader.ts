/**
 * The reader. Loads project configuration from kural.config.json on disk.
 * It is the only module that reads the config file — no other module
 * touches the filesystem for configuration.
 */

import { existsSync, readFileSync } from "node:fs";
import type { KuralConfig } from "./schema.ts";
import { join } from "node:path";
import { validateConfig } from "./validate.ts";

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
    const { config, warnings } = validateConfig(parsed);
    for (const warning of warnings) {
      console.error(`Warning: ${CONFIG_FILENAME}: ${warning}`);
    }
    return config as Partial<KuralConfig>;
  } catch (err) {
    console.error(
      `Warning: failed to parse ${CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)} — using defaults`,
    );
    return {};
  }
}

export { loadProjectConfig };
