import { describe, expect, it } from "vite-plus/test";
import { getJSDoc, isUtilModule } from "./jsdoc.ts";
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
    expect(info.patterns).toBe("cacheKey");
  });

  it("extracts @kuralCompanion tag", () => {
    const info = jsdocFrom(`/** @kuralCompanion tableShape */\nfunction foo() {}`);
    expect(info.companion).toBe("tableShape");
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
