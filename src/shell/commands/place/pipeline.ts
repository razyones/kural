/**
 * The bridge. Loads a snapshot, builds a tree, and runs the placement
 * engine against a user query. It is the only module that connects
 * database state to the placement algorithm — no other module
 * orchestrates the read-embed-place flow.
 */

import { activePath, closeSnapshot, currentBranch, openSnapshot } from "../../../db/snapshot.ts";
import type { PlacementResult } from "../../../analysis/place/types.ts";
import { buildTree } from "../../../analysis/tree/tree.ts";
import { createEmbeddingModel } from "../../../analysis/ingestion/embed/model.ts";
import { existsSync } from "node:fs";
import { place } from "../../../analysis/place/engine.ts";
import { rebuildParseResult } from "../audit/pipeline.ts";

/**
 * Runs the placement pipeline: open snapshot → build tree → embed → place.
 * @param root - Absolute path to the project root
 * @param description - Text description of the code to place
 * @param provider - Embedding provider name
 * @param model - Optional model override
 * @param apiKey - Optional API key override
 * @returns The complete placement result
 * @kuralCauses reads snapshot, calls embedding API, runs placement
 */
async function runPlacement(
  root: string,
  description: string,
  provider: string,
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

    const { embed } = createEmbeddingModel({ provider, model, apiKey });
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
