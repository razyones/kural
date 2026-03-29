/**
 * The scribe. Builds structural signature strings from parsed code
 * units — field lists, param lists, export lists. It is the only module
 * that expresses structure as delimited text — no other module turns
 * parsed fields and params into signature strings.
 */

import type { KuralDirectory, KuralFile, KuralFunction, KuralType } from "../parse/types.ts";
import { basename } from "node:path";

const NONE = 0;

/**
 * Builds an identity signature from a unit's name and optional description.
 * @param name - The unit's name
 * @param description - Optional human-written description
 * @returns A plain-text identity signature string
 * @kuralPure
 */
function identitySignature(name: string, description?: string): string {
  if (description === undefined || description === "") {
    return name;
  }
  return `${name}: ${description}`;
}

/**
 * Extracts only the structural shape of a type — its fields.
 * @param type - The KuralType to extract structure from
 * @returns Field structure string, or empty string if no fields
 * @kuralPure
 * @kuralPatterns unitSignature
 */
function typeSignature(type: KuralType): string {
  const entries = Object.entries(type.fields);
  if (entries.length === NONE) {
    return "";
  }
  const fieldStr = entries.map(([name, typ]) => `${name} (${typ})`).join(", ");
  return `fields: ${fieldStr}`;
}

/**
 * Builds a leaf signature for a type, appending field names and types.
 * @param type - The KuralType to build a signature for
 * @returns A plain-text leaf signature with structural context
 * @kuralPure
 * @kuralPatterns unitLeafSignature
 */
function typeLeafSignature(type: KuralType): string {
  const identity = identitySignature(type.name, type.description);
  const sig = typeSignature(type);
  if (sig === "") {
    return identity;
  }
  return `${identity} | ${sig}`;
}

/**
 * Extracts only the structural shape of a function — its params and return.
 * @param fn - The KuralFunction to extract structure from
 * @returns Params and return type string
 * @kuralPure
 * @kuralPatterns unitSignature
 */
function functionSignature(fn: KuralFunction): string {
  const parts: string[] = [];
  if (fn.paramNames.length > NONE) {
    const paramStr = fn.paramNames
      .map((name, i) => `${name} (${fn.params[i] ?? "unknown"})`)
      .join(", ");
    parts.push(`params: ${paramStr}`);
  }
  parts.push(`returns: ${fn.returns}`);
  return parts.join(" | ");
}

/**
 * Builds a leaf signature for a function, appending parameters and return type.
 * @param fn - The KuralFunction to build a signature for
 * @returns A plain-text leaf signature with structural context
 * @kuralPure
 * @kuralPatterns unitLeafSignature
 */
function functionLeafSignature(fn: KuralFunction): string {
  const identity = identitySignature(fn.name, fn.description);
  return `${identity} | ${functionSignature(fn)}`;
}

/**
 * Extracts only the structural shape of a file — its exports.
 * @param file - The KuralFile to extract structure from
 * @returns Exports string, or empty string if no exports
 * @kuralPure
 * @kuralPatterns unitSignature
 */
function fileSignature(file: KuralFile): string {
  const exports: string[] = [];
  for (const type of Object.values(file.types)) {
    if (type.exported) {
      exports.push(type.name);
    }
  }
  for (const fn of Object.values(file.functions)) {
    if (fn.exported) {
      exports.push(fn.name);
    }
  }
  if (exports.length === NONE) {
    return "";
  }
  return `exports: ${exports.join(", ")}`;
}

/**
 * Builds a leaf signature for a file, appending exported member names.
 * @param file - The KuralFile to build a signature for
 * @returns A plain-text leaf signature with structural context
 * @kuralPure
 * @kuralPatterns unitLeafSignature
 */
function fileLeafSignature(file: KuralFile): string {
  const identity = identitySignature(file.name, file.description);
  const sig = fileSignature(file);
  if (sig === "") {
    return identity;
  }
  return `${identity} | ${sig}`;
}

/**
 * Extracts only the structural shape of a directory — its children.
 * @param dir - The KuralDirectory to extract structure from
 * @returns Children string, or empty string if no children
 * @kuralPure
 * @kuralPatterns unitSignature
 */
function directorySignature(dir: KuralDirectory): string {
  if (dir.children.length === NONE) {
    return "";
  }
  const childNames = dir.children.map((c) => basename(c));
  return `children: ${childNames.join(", ")}`;
}

/**
 * Builds a leaf signature for a directory, appending child names.
 * @param dir - The KuralDirectory to build a signature for
 * @returns A plain-text leaf signature with structural context
 * @kuralPure
 * @kuralPatterns unitLeafSignature
 */
function directoryLeafSignature(dir: KuralDirectory): string {
  const identity = identitySignature(dir.name, dir.description);
  const sig = directorySignature(dir);
  if (sig === "") {
    return identity;
  }
  return `${identity} | ${sig}`;
}

export {
  directoryLeafSignature,
  directorySignature,
  fileLeafSignature,
  fileSignature,
  functionLeafSignature,
  functionSignature,
  identitySignature,
  typeLeafSignature,
  typeSignature,
};
