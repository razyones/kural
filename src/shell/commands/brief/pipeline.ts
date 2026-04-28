/**
 * Opens a snapshot, builds a tree, loads cap overrides from the
 * project config, and delegates to the brief engine. It is the only
 * module that bridges stored state to the brief engine — no other
 * module orchestrates the snapshot-to-engine flow for facet retrieval.
 */

import { activePath, closeSnapshot, currentBranch, openSnapshot } from "../../../db/snapshot.ts";
import type { Brief } from "../../../analysis/brief/types.ts";
import { brief } from "../../../analysis/brief/engine.ts";
import { buildTree } from "../../../analysis/tree/tree.ts";
import { createEmbeddingModel } from "../../../analysis/ingestion/embed/model.ts";
import { existsSync } from "node:fs";
import { loadProjectConfig } from "../../config/loader.ts";
import { rebuildParseResult } from "../../../db/rebuild.ts";

const NONE = 0;

/**
 * Runs the brief pipeline: open snapshot → build tree → embed → brief.
 * @param root - Absolute path to the project root
 * @param description - Text description of the code the agent plans to write
 * @param gateway - Embedding gateway id
 * @param model - Optional model override
 * @param apiKey - Optional API key override
 * @returns The complete brief for the description
 * @kuralCauses reads snapshot, calls embedding API, runs placement
 */
async function runBrief(
  root: string,
  description: string,
  gateway: string,
  model?: string,
  apiKey?: string,
): Promise<Brief> {
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

    return await brief(description, nodes, embedder, projectConfig.brief);
  } finally {
    await closeSnapshot(snapshot);
  }
}

export { runBrief };
