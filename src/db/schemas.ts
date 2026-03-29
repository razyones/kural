/**
 * The contract. Defines Zod schemas for every collection stored in a
 * snapshot database. It is the only module that owns the persistence
 * shapes — no other module defines how units map to storage.
 */

import { z } from "zod";

const fileSchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string().optional(),
  identityEmbedding: z.array(z.number()),
  leafEmbedding: z.array(z.number()),
  facetHash: z.string().optional(),
  importsInternal: z.array(z.string()),
  importsExternal: z.array(z.string()),
  companion: z.string().optional(),
  residuals: z.array(z.object({ audit: z.string(), hash: z.string().optional() })),
});

const typeSchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string().optional(),
  fields: z.record(z.string(), z.string()),
  exported: z.boolean(),
  refs: z.array(z.string()),
  util: z.boolean(),
  helper: z.boolean(),
  residuals: z.array(z.object({ audit: z.string(), hash: z.string().optional() })),
  identityEmbedding: z.array(z.number()),
  leafEmbedding: z.array(z.number()),
  facetHash: z.string().optional(),
  patterns: z.string().optional(),
});

const functionSchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string().optional(),
  params: z.array(z.string()),
  paramNames: z.array(z.string()),
  returnsType: z.string(),
  exported: z.boolean(),
  pure: z.boolean(),
  util: z.boolean(),
  helper: z.boolean(),
  residuals: z.array(z.object({ audit: z.string(), hash: z.string().optional() })),
  causes: z.string().optional(),
  calls: z.array(z.string()),
  identityEmbedding: z.array(z.number()),
  leafEmbedding: z.array(z.number()),
  facetHash: z.string().optional(),
  patterns: z.string().optional(),
  documentedParams: z.number(),
  hasReturnDoc: z.boolean(),
});

const directorySchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string().optional(),
  children: z.array(z.string()),
  identityEmbedding: z.array(z.number()),
  leafEmbedding: z.array(z.number()),
  facetHash: z.string().optional(),
  residuals: z.array(z.object({ audit: z.string(), hash: z.string().optional() })),
});

const scoreSchema = z.object({
  key: z.string(),
  kind: z.string(),
  name: z.string(),
  labelFit: z.number(),
  labelUniqueness: z.number(),
  subtreeFit: z.number(),
  subtreeUniqueness: z.number(),
  subtreeMinFit: z.number(),
  subtreeMinUniqueness: z.number(),
  overallScore: z.number().optional(),
  worstPair: z.string().optional(),
  bestUncleName: z.string().optional(),
  bestUncleScore: z.number().optional(),
});

const metadataSchema = z.object({
  key: z.string(),
  value: z.string(),
});

/** Inferred row type for the files collection. */
type FileRow = z.output<typeof fileSchema>;
/** Inferred row type for the types collection. */
type TypeRow = z.output<typeof typeSchema>;
/** Inferred row type for the functions collection. */
type FunctionRow = z.output<typeof functionSchema>;
/** Inferred row type for the directories collection. */
type DirectoryRow = z.output<typeof directorySchema>;
/** Inferred row type for the scores collection. */
type ScoreRow = z.output<typeof scoreSchema>;
/** Inferred row type for the metadata collection. */
type MetadataRow = z.output<typeof metadataSchema>;

export { directorySchema, fileSchema, functionSchema, metadataSchema, scoreSchema, typeSchema };
export type { DirectoryRow, FileRow, FunctionRow, MetadataRow, ScoreRow, TypeRow };
