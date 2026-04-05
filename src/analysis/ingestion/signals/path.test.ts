import { describe, expect, it } from "vite-plus/test";
import { buildPathSignal } from "./path.ts";

describe("buildPathSignal for root", () => {
  it("joins domain keywords with hyphens and trailing slash", () => {
    const keywords = ["typescript", "AST", "syntax"];
    const result = buildPathSignal("/src", "/src", keywords);

    expect(result).toBe("typescript-AST-syntax/");
  });

  it("handles single keyword", () => {
    const result = buildPathSignal("/src", "/src", ["code"]);

    expect(result).toBe("code/");
  });
});

describe("buildPathSignal for non-root", () => {
  it("joins keywords with slashes and appends path without own name", () => {
    const keywords = ["typescript", "AST", "syntax"];
    const result = buildPathSignal("/src/ingestion/parse", "/src", keywords);

    expect(result).toBe("typescript/AST/syntax/ingestion/");
  });

  it("strips filename for files", () => {
    const keywords = ["typescript", "AST", "syntax"];
    const result = buildPathSignal("/src/ingestion/parse/extract.ts", "/src", keywords);

    expect(result).toBe("typescript/AST/syntax/ingestion/parse/");
  });

  it("handles direct child of root", () => {
    const keywords = ["code", "structure", "scoring"];
    const result = buildPathSignal("/src/cli.ts", "/src", keywords);

    expect(result).toBe("code/structure/scoring/");
  });

  it("handles directory one level below root", () => {
    const keywords = ["code", "structure", "scoring"];
    const result = buildPathSignal("/src/utils", "/src", keywords);

    expect(result).toBe("code/structure/scoring/");
  });

  it("handles deeply nested path", () => {
    const keywords = ["ts", "code", "lint"];
    const result = buildPathSignal("/src/a/b/c/d.ts", "/src", keywords);

    expect(result).toBe("ts/code/lint/a/b/c/");
  });
});
