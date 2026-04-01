/**
 * The gatherer. Assembles text facets into parallel arrays ready for
 * batch vectorization — names, descriptions, paths, signatures, and
 * causes. It is the only module that prepares raw inputs for the
 * embedding pipeline — no other module marshals the text that becomes
 * numerical vectors.
 */

import type { KuralDirectory, KuralFile, KuralUnit } from "../parse/types.ts";
import { functionSignature, typeSignature } from "../signals/signatures.ts";
import type { ParseResult } from "../parse/pipeline.ts";
import { buildPathSignal } from "../signals/path.ts";
import { buildProse } from "../signals/prose.ts";
import { getCausesText } from "../signals/causes.ts";

const NONE = 0;

/** Collected data for leaf units (types and functions). @kuralPatterns dataShape */
type LeafData = {
  /** Unit display names */
  names: string[];
  /** JSDoc descriptions or KURAL.md text */
  descs: string[];
  /** Parent file descriptions for anchoring leaf descriptions */
  parentDescs: string[];
  /** Path signals with domain keywords */
  paths: string[];
  /** Structural signature texts */
  sigs: string[];
  /** Causes descriptions for impure functions */
  causes: string[];
  /** Call-graph texts for functions with outbound calls */
  calls: string[];
  /** References to the original unit objects for write-back */
  units: KuralUnit[];
  /** Maps file path to the leaf indices that belong to it */
  fileChildIndices: Map<string, number[]>;
  /** Pattern group IDs aligned with units (undefined if no pattern) */
  patternIds: (string | undefined)[];
};

/** Collected data for container units (files and directories). @kuralPatterns dataShape */
type ContainerData = {
  /** Unit display names */
  names: string[];
  /** JSDoc descriptions or KURAL.md text */
  descs: string[];
  /** Path signals with domain keywords */
  paths: string[];
  /** References to the original unit objects for write-back */
  units: KuralUnit[];
  /** Absolute paths of each unit, aligned with units */
  unitPaths: string[];
  /** Number of file units (indices 0..fileCount-1 are files) */
  fileCount: number;
  /** Directory objects for bottom-up traversal */
  dirs: KuralDirectory[];
};

/**
 * Collects text facets and unit references for all leaf units (types
 * and functions) in a parse result. Builds signature text from prose
 * when Language Service info is available, falling back to structural
 * signature builders.
 * @param result - The parsed codebase to collect from
 * @param rootPath - Absolute path to the generation root
 * @param keywords - Top domain keywords
 * @param dictionary - Domain term definitions for prose signatures
 * @returns Leaf facets, units, and file-to-child-index mapping
 * @kuralPure
 * @kuralPatterns collectUnit
 */
/** Pushes a leaf unit's facets into the parallel arrays. @kuralHelper */
function pushLeaf(
  data: LeafData,
  unit: KuralUnit,
  desc: string,
  fileDesc: string,
  rootPath: string,
  keywords: string[],
  sig: string,
  causes: string,
  calls: string,
  patternId: string | undefined,
): void {
  data.names.push(unit.name);
  data.descs.push(desc);
  data.parentDescs.push(fileDesc);
  data.paths.push(buildPathSignal(unit.path, rootPath, keywords));
  data.sigs.push(sig);
  data.causes.push(causes);
  data.calls.push(calls);
  data.units.push(unit);
  data.patternIds.push(patternId);
}

/** Collects all leaves from a single file into the shared LeafData arrays. @kuralHelper */
function collectFileLeaves(
  file: KuralFile,
  data: LeafData,
  rootPath: string,
  keywords: string[],
  dictionary: Record<string, string>,
): void {
  const fileDesc = file.description ?? "";
  const childIndices: number[] = [];
  for (const type of Object.values(file.types)) {
    const sig = type.symbolInfo ? buildProse(type.symbolInfo, dictionary) : typeSignature(type);
    childIndices.push(data.units.length);
    pushLeaf(
      data,
      type,
      type.description ?? "",
      fileDesc,
      rootPath,
      keywords,
      sig,
      "",
      "",
      type.patterns,
    );
  }
  for (const fn of Object.values(file.functions)) {
    const sig = fn.symbolInfo ? buildProse(fn.symbolInfo, dictionary) : functionSignature(fn);
    childIndices.push(data.units.length);
    const callsText = fn.calls.length > NONE ? `calls: ${fn.calls.join(", ")}` : "";
    pushLeaf(
      data,
      fn,
      fn.description ?? "",
      fileDesc,
      rootPath,
      keywords,
      sig,
      getCausesText(fn),
      callsText,
      fn.patterns,
    );
  }
  data.fileChildIndices.set(file.path, childIndices);
}

function collectLeaves(
  result: ParseResult,
  rootPath: string,
  keywords: string[],
  dictionary: Record<string, string>,
): LeafData {
  const data: LeafData = {
    names: [],
    descs: [],
    parentDescs: [],
    paths: [],
    sigs: [],
    causes: [],
    calls: [],
    units: [],
    fileChildIndices: new Map(),
    patternIds: [],
  };

  for (const file of Object.values(result.files)) {
    collectFileLeaves(file, data, rootPath, keywords, dictionary);
  }

  return data;
}

/**
 * Collects text facets and unit references for files and directories
 * in a parse result. Files are collected first, then directories, so
 * indices 0..fileCount-1 are files and the rest are directories.
 * @param result - The parsed codebase to collect from
 * @param rootPath - Absolute path to the generation root
 * @param keywords - Top domain keywords
 * @returns Container facets, units, paths, and directory objects
 * @kuralPure
 * @kuralPatterns collectUnit
 */
function collectContainers(
  result: ParseResult,
  rootPath: string,
  keywords: string[],
): ContainerData {
  const data: ContainerData = {
    names: [],
    descs: [],
    paths: [],
    units: [],
    unitPaths: [],
    fileCount: NONE,
    dirs: [],
  };

  for (const file of Object.values(result.files)) {
    data.names.push(file.name);
    data.descs.push(file.description ?? "");
    data.paths.push(buildPathSignal(file.path, rootPath, keywords));
    data.units.push(file);
    data.unitPaths.push(file.path);
  }
  data.fileCount = data.units.length;

  for (const dir of Object.values(result.directories)) {
    data.names.push(dir.name);
    data.descs.push(dir.description ?? "");
    data.paths.push(buildPathSignal(dir.path, rootPath, keywords));
    data.units.push(dir);
    data.unitPaths.push(dir.path);
    data.dirs.push(dir);
  }

  return data;
}

const PATTERN_NONE = 0;

/**
 * Collapses leaf embeddings by pattern group: members sharing a
 * `patterns` tag are averaged into a single centroid so each concept
 * contributes equally to the file's leaf regardless of instance count.
 * @param indices - Child leaf indices for this file
 * @param leafEmbeddings - Computed leaf embeddings for leaf units
 * @param leaves - Leaf data for pattern tag lookup
 * @param meanFn - Function that computes element-wise mean of vectors
 * @returns One representative vector per distinct concept
 * @kuralPure
 */
function collapseByPattern(
  indices: number[],
  leafEmbeddings: number[][],
  leaves: LeafData,
  meanFn: (vecs: number[][]) => number[],
): number[][] {
  const groups = new Map<string, number[][]>();
  const ungrouped: number[][] = [];

  for (const idx of indices) {
    const patternId = leaves.patternIds[idx];
    const vec = leafEmbeddings[idx];
    if (vec === undefined || vec.length === PATTERN_NONE) {
      continue;
    }
    if (patternId !== undefined && patternId !== "") {
      const bucket = groups.get(patternId);
      if (bucket) {
        bucket.push(vec);
      } else {
        groups.set(patternId, [vec]);
      }
    } else {
      ungrouped.push(vec);
    }
  }

  const reps = [...ungrouped];
  for (const vecs of groups.values()) {
    reps.push(meanFn(vecs));
  }
  return reps;
}

export { collapseByPattern, collectContainers, collectLeaves };
export type { ContainerData, LeafData };
