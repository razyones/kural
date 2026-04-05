/**
 * The narrator. Translates Language Service display parts into natural
 * language with dictionary-grounded terms. It is the only module that
 * produces prose from compiler semantics — no other module turns
 * SymbolDisplayPart arrays into human-readable sentences.
 */

import type { DisplayPart, SymbolInfo } from "../parse/types.ts";

const NONE = 0;
const SINGLE = 1;
const PAIR = 2;
const NOT_FOUND = -1;
const AFTER_PAREN = 1;

const PRIMITIVE_MAP: Record<string, string> = {
  string: "text",
  number: "a number",
  boolean: "a boolean",
  void: "nothing",
  undefined: "undefined",
  null: "null",
  never: "never",
  any: "any value",
  unknown: "an unknown value",
};

/**
 * Converts a sequence of type display parts into natural language.
 * @param typeParts - Display parts representing a single type expression
 * @param dictionary - Domain term definitions for link-style references
 * @param referenced - Set to collect referenced dictionary terms into
 * @returns Natural language description of the type
 * @kuralPure
 */
function describeType(
  typeParts: DisplayPart[],
  dictionary: Record<string, string>,
  referenced: Set<string>,
): string {
  const tokens = typeParts.filter((p) => p.kind !== "space" && p.kind !== "lineBreak");

  if (tokens.length === NONE) {
    return "unknown";
  }

  const secondToLast = tokens.length >= PAIR ? tokens[tokens.length - PAIR] : undefined;
  const last = tokens[tokens.length - SINGLE];
  const isArray = secondToLast?.text === "[" && last.text === "]";

  if (isArray) {
    const inner = describeType(tokens.slice(NONE, -PAIR), dictionary, referenced);
    return `array of ${inner}`;
  }

  const isPromise =
    tokens[NONE].kind === "localName" &&
    tokens[NONE].text === "Promise" &&
    tokens.length > SINGLE &&
    tokens[SINGLE].text === "<";

  if (isPromise) {
    const inner = describeType(tokens.slice(PAIR, -SINGLE), dictionary, referenced);
    return `promise of ${inner}`;
  }

  if (tokens.length === SINGLE && tokens[NONE].kind === "keyword") {
    return PRIMITIVE_MAP[tokens[NONE].text] ?? tokens[NONE].text;
  }

  if (tokens.length === SINGLE && tokens[NONE].kind === "aliasName") {
    const name = tokens[NONE].text;
    if (dictionary[name] !== undefined) {
      referenced.add(name);
      return `[${name}]`;
    }
    return name;
  }

  return tokens.map((t) => t.text).join("");
}

/**
 * Extracts parameter info from function display parts.
 * @param parts - Full display parts for a function symbol
 * @returns Array of [paramName, typeParts] pairs
 * @kuralPure
 * @kuralPatterns extractParts
 */
function extractParams(parts: DisplayPart[]): [string, DisplayPart[]][] {
  const params: [string, DisplayPart[]][] = [];
  let i = NONE;

  while (i < parts.length) {
    if (parts[i].kind === "parameterName") {
      const paramName = parts[i].text;
      const typeParts: DisplayPart[] = [];
      i++;
      while (i < parts.length && parts[i].text !== "," && parts[i].text !== ")") {
        if (
          parts[i].kind !== "punctuation" ||
          parts[i].text === "[" ||
          parts[i].text === "]" ||
          parts[i].text === "<" ||
          parts[i].text === ">"
        ) {
          typeParts.push(parts[i]);
        }
        i++;
      }
      params.push([paramName, typeParts]);
    }
    i++;
  }

  return params;
}

/**
 * Extracts the return type display parts from function display parts.
 * @param parts - Full display parts for a function symbol
 * @returns Display parts for the return type
 * @kuralPure
 * @kuralPatterns extractParts
 */
function extractReturnType(parts: DisplayPart[]): DisplayPart[] {
  let lastCloseParen = NOT_FOUND;
  for (let i = parts.length - SINGLE; i >= NONE; i--) {
    if (parts[i].text === ")") {
      lastCloseParen = i;
      break;
    }
  }

  if (lastCloseParen === NOT_FOUND) {
    return [];
  }

  const returnParts: DisplayPart[] = [];
  for (let i = lastCloseParen + AFTER_PAREN; i < parts.length; i++) {
    if (
      parts[i].kind !== "punctuation" ||
      parts[i].text === "[" ||
      parts[i].text === "]" ||
      parts[i].text === "<" ||
      parts[i].text === ">"
    ) {
      returnParts.push(parts[i]);
    }
  }

  return returnParts;
}

/**
 * Builds prose for a function symbol.
 * @param parts - Display parts for the function
 * @param dictionary - Domain term definitions
 * @param referenced - Set to collect referenced terms
 * @returns Prose describing the function's signature
 * @kuralPure
 * @kuralPatterns buildUnitProse
 * @kuralHelper
 */
function buildFunctionProse(
  parts: DisplayPart[],
  dictionary: Record<string, string>,
  referenced: Set<string>,
): string {
  const params = extractParams(parts);
  const returnParts = extractReturnType(parts);
  const returnDesc = describeType(returnParts, dictionary, referenced);

  if (params.length === NONE) {
    return `returns ${returnDesc}.`;
  }

  const paramPhrases = params.map(([name, typeParts]) => {
    const typeDesc = describeType(typeParts, dictionary, referenced);
    return `${name} (${typeDesc})`;
  });

  return `takes ${paramPhrases.join(", ")}. Returns ${returnDesc}.`;
}

/**
 * Extracts field info from type display parts.
 * @param parts - Full display parts for a type symbol
 * @returns Array of [fieldName, typeParts] pairs
 * @kuralPure
 * @kuralPatterns extractParts
 */
function extractFields(parts: DisplayPart[]): [string, DisplayPart[]][] {
  const fields: [string, DisplayPart[]][] = [];
  let i = NONE;

  while (i < parts.length) {
    if (parts[i].kind === "propertyName") {
      const fieldName = parts[i].text;
      const typeParts: DisplayPart[] = [];
      i++;
      while (i < parts.length && parts[i].text !== ";") {
        if (
          parts[i].kind !== "punctuation" ||
          parts[i].text === "[" ||
          parts[i].text === "]" ||
          parts[i].text === "<" ||
          parts[i].text === ">"
        ) {
          typeParts.push(parts[i]);
        }
        i++;
      }
      fields.push([fieldName, typeParts]);
    }
    i++;
  }

  return fields;
}

/**
 * Builds prose for a type symbol.
 * @param parts - Display parts for the type
 * @param dictionary - Domain term definitions
 * @param referenced - Set to collect referenced terms
 * @returns Prose describing the type's fields
 * @kuralPure
 * @kuralPatterns buildUnitProse
 * @kuralHelper
 */
function buildTypeProse(
  parts: DisplayPart[],
  dictionary: Record<string, string>,
  referenced: Set<string>,
): string {
  const fields = extractFields(parts);
  if (fields.length === NONE) {
    return "";
  }

  const fieldPhrases = fields.map(([name, typeParts]) => {
    const typeDesc = describeType(typeParts, dictionary, referenced);
    return `${name} (${typeDesc})`;
  });

  return `has fields: ${fieldPhrases.join(", ")}.`;
}

/**
 * Builds the link-style definitions section for referenced dictionary terms.
 * @param referenced - Set of referenced term names
 * @param dictionary - Domain term definitions
 * @returns Definitions block, or empty string if none referenced
 * @kuralPure
 */
function buildDefinitions(referenced: Set<string>, dictionary: Record<string, string>): string {
  if (referenced.size === NONE) {
    return "";
  }

  const sorted = [...referenced].toSorted();
  return sorted.map((term) => `[${term}]: ${dictionary[term]}`).join("\n");
}

/**
 * Dispatches to the correct per-kind prose builder based on the symbol's first keyword, then appends dictionary definitions.
 * @param info - Structured symbol information from the Language Service
 * @param dictionary - Domain term definitions for link-style references
 * @returns Prose signature with appended dictionary definitions
 * @kuralPure
 */
function buildProse(info: SymbolInfo, dictionary: Record<string, string>): string {
  const firstKeyword = info.displayParts.find((p) => p.kind === "keyword")?.text;
  const referenced = new Set<string>();

  let prose: string;
  if (firstKeyword === "function") {
    prose = buildFunctionProse(info.displayParts, dictionary, referenced);
  } else if (firstKeyword === "type") {
    prose = buildTypeProse(info.displayParts, dictionary, referenced);
  } else {
    return "";
  }

  const definitions = buildDefinitions(referenced, dictionary);
  if (definitions === "") {
    return prose;
  }
  return `${prose}\n\n${definitions}`;
}

export { buildProse };
