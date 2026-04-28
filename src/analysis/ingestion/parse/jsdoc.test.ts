import { describe, expect, it } from "vite-plus/test";
import { getFileJSDoc, getJSDoc, isUtilModule } from "./jsdoc.ts";
import type { JSDocInfo } from "./jsdoc.ts";
import ts from "typescript";

const FIRST_STATEMENT = 0;
const ARRAY_FIRST = 0;
const ARRAY_SECOND = 1;
const NONE = 0;
const PAIR = 2;

const NO_TAGS: JSDocInfo = {
  pure: false,
  util: false,
  helper: false,
  residuals: [],
  documentedParams: NONE,
  hasReturnDoc: false,
};
const UTIL_TAG: JSDocInfo = {
  pure: false,
  util: true,
  helper: false,
  residuals: [],
  documentedParams: NONE,
  hasReturnDoc: false,
};

/** Parses source text and returns the JSDoc from the first statement. */
function jsdocFrom(source: string): JSDocInfo {
  const sf = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);
  return getJSDoc(sf.statements[FIRST_STATEMENT]);
}

/** Parses source text and returns the file-level JSDoc anchored on the first statement. */
function fileJSDocFrom(source: string): JSDocInfo {
  const sf = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);
  return getFileJSDoc(sf.statements[FIRST_STATEMENT]);
}

describe("getJSDoc @kuralResidual parsing", () => {
  it("parses audit name without hash", () => {
    const info = jsdocFrom(`/** @kuralResidual outliers */\nfunction foo() {}`);
    expect(info.residuals).toEqual([{ audit: "outliers", hash: undefined }]);
  });

  it("parses audit name with hash", () => {
    const info = jsdocFrom(`/** @kuralResidual merge-candidates a3f2b1c9 */\nfunction foo() {}`);
    expect(info.residuals).toEqual([{ audit: "merge-candidates", hash: "a3f2b1c9" }]);
  });

  it("parses multiple @kuralResidual tags", () => {
    const source = [
      "/**",
      " * @kuralResidual outliers",
      " * @kuralResidual merge-candidates abc12345",
      " */",
      "function foo() {}",
    ].join("\n");
    const info = jsdocFrom(source);
    expect(info.residuals).toHaveLength(PAIR);
    expect(info.residuals[ARRAY_FIRST]).toEqual({ audit: "outliers", hash: undefined });
    expect(info.residuals[ARRAY_SECOND]).toEqual({ audit: "merge-candidates", hash: "abc12345" });
  });

  it("ignores @kuralResidual with no comment", () => {
    const info = jsdocFrom(`/** @kuralResidual */\nfunction foo() {}`);
    expect(info.residuals).toEqual([]);
  });

  it("returns empty residuals when no @kuralResidual tags present", () => {
    const info = jsdocFrom(`/** @kuralPure */\nfunction foo() {}`);
    expect(info.residuals).toEqual([]);
  });
});

describe("getJSDoc kural tag extraction", () => {
  it("extracts @kuralHelper tag", () => {
    const info = jsdocFrom(`/** @kuralHelper */\nfunction foo() {}`);
    expect(info.helper).toBe(true);
  });

  it("extracts @kuralCauses tag with comment", () => {
    const info = jsdocFrom(`/** @kuralCauses writes to disk */\nfunction foo() {}`);
    expect(info.causes).toBe("writes to disk");
  });

  it("extracts @kuralPatterns tag", () => {
    const info = jsdocFrom(`/** @kuralPatterns cacheKey */\nfunction foo() {}`);
    expect(info.patterns).toEqual(["cacheKey"]);
  });

  it("accumulates multiple @kuralPatterns tags", () => {
    const src = [
      "/**",
      " * @kuralPatterns outer",
      " * @kuralPatterns inner",
      " */",
      "function foo() {}",
    ].join("\n");
    const info = jsdocFrom(src);
    expect(info.patterns).toEqual(["outer", "inner"]);
  });

  it("parses comma-separated @kuralPatterns", () => {
    const info = jsdocFrom(`/** @kuralPatterns outer, inner */\nfunction foo() {}`);
    expect(info.patterns).toEqual(["outer", "inner"]);
  });

  it("ignores empty segments in comma-separated @kuralPatterns", () => {
    const info = jsdocFrom(`/** @kuralPatterns outer,, inner */\nfunction foo() {}`);
    expect(info.patterns).toEqual(["outer", "inner"]);
  });

  it("extracts @kuralCompanion tag", () => {
    const info = jsdocFrom(`/** @kuralCompanion tableShape */\nfunction foo() {}`);
    expect(info.companion).toBe("tableShape");
  });
});

describe("getJSDoc @kuralBound parsing", () => {
  it("parses @kuralBound inward", () => {
    const info = jsdocFrom(`/** @kuralBound inward */\nfunction foo() {}`);
    expect(info.bound).toBe("inward");
  });

  it("parses @kuralBound outward", () => {
    const info = jsdocFrom(`/** @kuralBound outward */\nfunction foo() {}`);
    expect(info.bound).toBe("outward");
  });

  it("ignores @kuralBound with invalid qualifier", () => {
    const info = jsdocFrom(`/** @kuralBound sideways */\nfunction foo() {}`);
    expect(info.bound).toBeUndefined();
  });

  it("ignores @kuralBound with no comment", () => {
    const info = jsdocFrom(`/** @kuralBound */\nfunction foo() {}`);
    expect(info.bound).toBeUndefined();
  });
});

describe("getJSDoc param and returns extraction", () => {
  it("counts @param tags with descriptions", () => {
    const source = [
      "/**",
      " * Does something.",
      " * @param a - First param",
      " * @param b - Second param",
      " */",
      "function foo(a: string, b: number) {}",
    ].join("\n");
    const info = jsdocFrom(source);
    expect(info.documentedParams).toBe(PAIR);
  });

  it("does not count @param tags without descriptions", () => {
    const info = jsdocFrom(`/** @param a */\nfunction foo(a: string) {}`);
    expect(info.documentedParams).toBe(NONE);
  });

  it("extracts @returns tag", () => {
    const source = [
      "/**",
      " * Does something.",
      " * @returns The result string",
      " */",
      "function foo() { return ''; }",
    ].join("\n");
    const info = jsdocFrom(source);
    expect(info.hasReturnDoc).toBe(true);
  });

  it("does not flag @returns without description", () => {
    const info = jsdocFrom(`/** @returns */\nfunction foo() { return ''; }`);
    expect(info.hasReturnDoc).toBe(false);
  });
});

describe("isUtilModule path detection", () => {
  it("detects files inside a utils/ directory", () => {
    expect(isUtilModule("/project/src/utils/math.ts", NO_TAGS)).toBe(true);
  });

  it("detects files inside a helpers/ directory", () => {
    expect(isUtilModule("/project/src/helpers/strings.ts", NO_TAGS)).toBe(true);
  });

  it("detects files with .utils. in the filename", () => {
    expect(isUtilModule("/project/src/date.utils.ts", NO_TAGS)).toBe(true);
  });

  it("detects nested utils paths", () => {
    expect(isUtilModule("/project/src/utils/format/index.ts", NO_TAGS)).toBe(true);
  });

  it("does not flag regular files", () => {
    expect(isUtilModule("/project/src/user.ts", NO_TAGS)).toBe(false);
  });

  it("does not flag files whose name merely contains utils as a substring", () => {
    expect(isUtilModule("/project/src/xutils.ts", NO_TAGS)).toBe(false);
  });
});

describe("isUtilModule JSDoc detection", () => {
  it("detects file-level @kuralUtil tag", () => {
    expect(isUtilModule("/project/src/logging.ts", UTIL_TAG)).toBe(true);
  });

  it("file-level tag works even on a regular path", () => {
    expect(isUtilModule("/project/src/domain/service.ts", UTIL_TAG)).toBe(true);
  });
});

describe("isUtilModule combined", () => {
  it("returns true when both path and tag match", () => {
    expect(isUtilModule("/project/src/utils/math.ts", UTIL_TAG)).toBe(true);
  });

  it("returns false when neither path nor tag match", () => {
    expect(isUtilModule("/project/src/domain/service.ts", NO_TAGS)).toBe(false);
  });
});

describe("getFileJSDoc with multiple JSDoc blocks on the first statement", () => {
  const SOURCE = [
    "/**",
    " * file-level description",
    " * @kuralUtil",
    " */",
    "",
    "/**",
    " * type-level description",
    " * @kuralPure",
    " */",
    "type Foo = { x: number };",
  ].join("\n");

  it("picks the first block as the file description", () => {
    const info = fileJSDocFrom(SOURCE);
    expect(info.description).toBe("file-level description");
  });

  it("picks file-level tags only — declaration tags do not bleed in", () => {
    const info = fileJSDocFrom(SOURCE);
    expect(info.util).toBe(true);
    expect(info.pure).toBe(false);
  });

  it("picks the last block as the declaration's own description", () => {
    const info = jsdocFrom(SOURCE);
    expect(info.description).toBe("type-level description");
  });

  it("picks declaration-level tags only — file tags do not bleed in", () => {
    const info = jsdocFrom(SOURCE);
    expect(info.pure).toBe(true);
    expect(info.util).toBe(false);
  });
});

describe("getFileJSDoc with a single JSDoc block", () => {
  it("returns that block when only the file JSDoc is present (import as first stmt)", () => {
    const source = `/**\n * file-only description\n */\nimport x from "y";`;
    expect(fileJSDocFrom(source).description).toBe("file-only description");
  });

  it("returns the only block on the first statement when no separation exists", () => {
    const source = `/**\n * shared description\n */\ntype Foo = { x: number };`;
    expect(fileJSDocFrom(source).description).toBe("shared description");
    expect(jsdocFrom(source).description).toBe("shared description");
  });
});
