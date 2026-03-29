/**
 * The gatherer. Walks a parsed codebase and collects text facets for
 * every unit — names, descriptions, paths, signatures, and causes —
 * into parallel arrays ready for batch embedding. It is the only module
 * that extracts embedding inputs from parsed structures — no other
 * module builds the text that enters the embedding pipeline.
 */

import type { KuralDirectory, KuralUnit } from "../parse/types.ts";
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
  };

  for (const file of Object.values(result.files)) {
    const fileDesc = file.description ?? "";
    const childIndices: number[] = [];
    for (const type of Object.values(file.types)) {
      const sig = type.symbolInfo ? buildProse(type.symbolInfo, dictionary) : typeSignature(type);
      childIndices.push(data.units.length);
      data.names.push(type.name);
      data.descs.push(type.description ?? "");
      data.parentDescs.push(fileDesc);
      data.paths.push(buildPathSignal(type.path, rootPath, keywords));
      data.sigs.push(sig);
      data.causes.push("");
      data.calls.push("");
      data.units.push(type);
    }
    for (const fn of Object.values(file.functions)) {
      const sig = fn.symbolInfo ? buildProse(fn.symbolInfo, dictionary) : functionSignature(fn);
      childIndices.push(data.units.length);
      data.names.push(fn.name);
      data.descs.push(fn.description ?? "");
      data.parentDescs.push(fileDesc);
      data.paths.push(buildPathSignal(fn.path, rootPath, keywords));
      data.sigs.push(sig);
      data.causes.push(getCausesText(fn));
      data.calls.push(fn.calls.length > NONE ? `calls: ${fn.calls.join(", ")}` : "");
      data.units.push(fn);
    }
    data.fileChildIndices.set(file.path, childIndices);
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

export { collectContainers, collectLeaves };
export type { ContainerData, LeafData };
