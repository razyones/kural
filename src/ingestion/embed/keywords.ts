/**
 * The selector. Picks the top domain keywords by aggregate cosine
 * similarity to all unit names. It is the only module that ranks
 * domain keywords — no other module decides which keywords best
 * represent the codebase.
 */

import { cosineSimilarity } from "./blend.ts";

const NONE = 0;
const TOP_COUNT = 3;

/**
 * Selects top domain keywords by aggregate cosine similarity to names.
 * @param keywordVectors - Embedding vectors for each domain keyword
 * @param nameVectors - Embedding vectors for all unit names
 * @param keywords - Domain keyword strings aligned with keywordVectors
 * @returns Top keywords sorted by descending aggregate similarity
 * @kuralPure
 */
function selectKeywords(
  keywordVectors: number[][],
  nameVectors: number[][],
  keywords: string[],
): string[] {
  if (keywords.length === NONE || nameVectors.length === NONE) {
    return [];
  }

  const scores = keywords.map((keyword, ki) => {
    let total = NONE;
    for (const nameVec of nameVectors) {
      total += cosineSimilarity(keywordVectors[ki], nameVec);
    }
    return { keyword, score: total };
  });

  scores.sort((a, b) => b.score - a.score);

  const limit = Math.min(TOP_COUNT, scores.length);
  const result: string[] = [];
  for (let i = NONE; i < limit; i++) {
    result.push(scores[i].keyword);
  }
  return result;
}

export { selectKeywords };
