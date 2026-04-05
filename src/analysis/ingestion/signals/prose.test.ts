import type { DisplayPart, SymbolInfo } from "../parse/types.ts";
import { describe, expect, it } from "vite-plus/test";
import { buildProse } from "./prose.ts";

const FIRST = 0;
const ONCE = 1;

function dp(kind: string, text: string): DisplayPart {
  return { kind, text };
}

const STRING = [dp("keyword", "string")];
const NUMBER = [dp("keyword", "number")];
const VOID = [dp("keyword", "void")];
const EMPTY_DICT: Record<string, string> = {};

function alias(name: string): DisplayPart[] {
  return [dp("aliasName", name)];
}

function arrayOf(inner: DisplayPart[]): DisplayPart[] {
  return [...inner, dp("punctuation", "["), dp("punctuation", "]")];
}

function promiseOf(inner: DisplayPart[]): DisplayPart[] {
  return [dp("localName", "Promise"), dp("punctuation", "<"), ...inner, dp("punctuation", ">")];
}

/** Builds SymbolInfo display parts for a function signature. */
function fnInfo(params: [string, DisplayPart[]][], returnParts: DisplayPart[]): SymbolInfo {
  const parts: DisplayPart[] = [
    dp("keyword", "function"),
    dp("space", " "),
    dp("functionName", "testFn"),
    dp("punctuation", "("),
  ];

  for (let i = FIRST; i < params.length; i++) {
    if (i > FIRST) {
      parts.push(dp("punctuation", ","), dp("space", " "));
    }
    const [name, typeParts] = params[i];
    parts.push(dp("parameterName", name), dp("punctuation", ":"), dp("space", " "));
    parts.push(...typeParts);
  }

  parts.push(dp("punctuation", ")"), dp("punctuation", ":"), dp("space", " "));
  parts.push(...returnParts);

  return { displayParts: parts, documentation: "", tags: [] };
}

/** Builds SymbolInfo display parts for a type with fields. */
function typeInfo(fields: [string, DisplayPart[]][]): SymbolInfo {
  const parts: DisplayPart[] = [
    dp("keyword", "type"),
    dp("space", " "),
    dp("aliasName", "TestType"),
    dp("space", " "),
    dp("operator", "="),
    dp("space", " "),
    dp("punctuation", "{"),
  ];

  for (const [name, typeParts] of fields) {
    parts.push(
      dp("lineBreak", "\n"),
      dp("space", "    "),
      dp("propertyName", name),
      dp("punctuation", ":"),
      dp("space", " "),
      ...typeParts,
      dp("punctuation", ";"),
    );
  }

  parts.push(dp("lineBreak", "\n"), dp("punctuation", "}"));

  return { displayParts: parts, documentation: "", tags: [] };
}

describe("buildProse function primitives", () => {
  it("converts primitive params to natural language", () => {
    const info = fnInfo(
      [
        ["name", STRING],
        ["age", NUMBER],
      ],
      VOID,
    );
    expect(buildProse(info, EMPTY_DICT)).toBe(
      "takes name (text), age (a number). Returns nothing.",
    );
  });

  it("handles no params", () => {
    const info = fnInfo([], arrayOf(alias("User")));
    expect(buildProse(info, EMPTY_DICT)).toBe("returns array of User.");
  });

  it("handles Promise return type", () => {
    const info = fnInfo([["count", NUMBER]], promiseOf(NUMBER));
    expect(buildProse(info, EMPTY_DICT)).toBe(
      "takes count (a number). Returns promise of a number.",
    );
  });
});

describe("buildProse function dictionary", () => {
  it("wraps dictionary terms and appends definitions", () => {
    const dict = { KuralFile: "a source file with functions and types" };
    const info = fnInfo([["file", alias("KuralFile")]], VOID);
    expect(buildProse(info, dict)).toBe(
      "takes file ([KuralFile]). Returns nothing.\n\n[KuralFile]: a source file with functions and types",
    );
  });

  it("handles array of dictionary terms", () => {
    const dict = { EmbedRef: "a deferred write-back" };
    const info = fnInfo([["refs", arrayOf(alias("EmbedRef"))]], VOID);
    expect(buildProse(info, dict)).toBe(
      "takes refs (array of [EmbedRef]). Returns nothing.\n\n[EmbedRef]: a deferred write-back",
    );
  });

  it("deduplicates dictionary definitions", () => {
    const dict = { EmbedRef: "a deferred write-back" };
    const info = fnInfo(
      [
        ["a", alias("EmbedRef")],
        ["b", alias("EmbedRef")],
      ],
      VOID,
    );
    const result = buildProse(info, dict);
    const defCount = result.split("[EmbedRef]:").length - ONCE;
    expect(defCount).toBe(ONCE);
  });
});

describe("buildProse for types", () => {
  it("converts primitive fields to natural language", () => {
    const info = typeInfo([
      ["x", NUMBER],
      ["y", NUMBER],
    ]);
    expect(buildProse(info, EMPTY_DICT)).toBe("has fields: x (a number), y (a number).");
  });

  it("wraps dictionary terms and appends definitions", () => {
    const dict = { KuralFile: "a source file" };
    const info = typeInfo([
      ["file", alias("KuralFile")],
      ["name", STRING],
    ]);
    expect(buildProse(info, dict)).toBe(
      "has fields: file ([KuralFile]), name (text).\n\n[KuralFile]: a source file",
    );
  });

  it("returns empty string for types with no fields", () => {
    const info = typeInfo([]);
    expect(buildProse(info, EMPTY_DICT)).toBe("");
  });
});

describe("buildProse definitions", () => {
  it("only includes referenced dictionary terms", () => {
    const dict = {
      KuralFile: "a source file",
      EmbedRef: "a deferred write-back",
      ParseResult: "the full parsed codebase",
    };
    const info = fnInfo([["file", alias("KuralFile")]], VOID);
    const result = buildProse(info, dict);
    expect(result).toContain("[KuralFile]: a source file");
    expect(result).not.toContain("EmbedRef");
    expect(result).not.toContain("ParseResult");
  });

  it("sorts definitions alphabetically", () => {
    const dict = {
      EmbedRef: "a deferred write-back",
      KuralFile: "a source file",
    };
    const info = fnInfo(
      [
        ["file", alias("KuralFile")],
        ["ref", alias("EmbedRef")],
      ],
      VOID,
    );
    const result = buildProse(info, dict);
    const embedPos = result.indexOf("[EmbedRef]:");
    const kuralPos = result.indexOf("[KuralFile]:");
    expect(embedPos).toBeLessThan(kuralPos);
  });
});
