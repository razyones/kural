/**
 * Opens a snapshot, builds a tree, and delegates to the
 * engine for the place command. It is the only module that bridges
 * stored state to the engine for this command — no other module
 * orchestrates the snapshot-to-engine flow for code queries.
 */

import { activePath, closeSnapshot, currentBranch, openSnapshot } from "../../../db/snapshot.ts";
import type { PlacementResult } from "../../../analysis/place/types.ts";
import { buildTree } from "../../../analysis/tree/tree.ts";
import { createEmbeddingModel } from "../../../llms/embedding.ts";
import { existsSync } from "node:fs";
import { loadProjectConfig } from "../../config/loader.ts";
import { place } from "../../../analysis/place/engine.ts";
import { rebuildParseResult } from "../../../db/rebuild.ts";

/**
 * Runs the placement pipeline: open snapshot → build tree → embed → place.
 * @param root - Absolute path to the project root
 * @param description - Text description of the code to place
 * @param gateway - Embedding gateway id
 * @param model - Optional model override
 * @param apiKey - Optional API key override
 * @returns The complete placement result
 * @kuralCauses reads snapshot, calls embedding API, runs placement
 */
async function runPlacement(
  root: string,
  description: string,
  gateway: string,
  model?: string,
  apiKey?: string,
): Promise<PlacementResult> {
  const branch = currentBranch();
  const dbPath = activePath(root, branch);
  if (!existsSync(dbPath)) {
    throw new Error("No active database found \u2014 run generate first");
  }

  const snapshot = await openSnapshot(dbPath);
  try {
    const result = rebuildParseResult(snapshot.collections);
    const nodes = buildTree(result);

    const projectConfig = loadProjectConfig(root);
    const { embed } = createEmbeddingModel({ gateway, model, apiKey }, projectConfig.gateways);
    const embedder = async (texts: string[]): Promise<number[][]> => {
      if (texts.length === NONE) {
        return [];
      }
      const vectors = await embed(texts);
      return vectors;
    };

    return await place(description, nodes, embedder);
  } finally {
    await closeSnapshot(snapshot);
  }
}

const NONE = 0;

export { runPlacement };
