import { describe, expect, test } from "vite-plus/test";
import { shortPath, stripKeyPrefix } from "./paths.ts";

describe("stripKeyPrefix — standard prefixes", () => {
  test("strips file: prefix", () => {
    expect(stripKeyPrefix("file:/src/app.ts")).toBe("/src/app.ts");
  });

  test("strips dir: prefix", () => {
    expect(stripKeyPrefix("dir:/src/utils")).toBe("/src/utils");
  });

  test("strips func: prefix", () => {
    expect(stripKeyPrefix("func:/src/app.ts:run")).toBe("/src/app.ts:run");
  });

  test("strips type: prefix", () => {
    expect(stripKeyPrefix("type:/src/app.ts:Config")).toBe("/src/app.ts:Config");
  });
});

describe("stripKeyPrefix — edge cases", () => {
  test("handles key with no colon (returns full string)", () => {
    expect(stripKeyPrefix("nocolon")).toBe("nocolon");
  });

  test("handles colon at position zero", () => {
    expect(stripKeyPrefix(":rest")).toBe("rest");
  });

  test("handles multiple colons (splits at first)", () => {
    expect(stripKeyPrefix("func:/src/app.ts:name")).toBe("/src/app.ts:name");
  });

  test("handles empty string", () => {
    expect(stripKeyPrefix("")).toBe("");
  });

  test("handles key that is just a colon", () => {
    expect(stripKeyPrefix(":")).toBe("");
  });
});

describe("shortPath — with rootPath", () => {
  test("returns relative path when rootPath is provided", () => {
    expect(shortPath("/src/utils/paths.ts", "/src")).toBe("utils/paths.ts");
  });

  test("returns basename when fullPath equals rootPath", () => {
    expect(shortPath("/src", "/src")).toBe("src");
  });
});

describe("shortPath — without rootPath", () => {
  test("returns fullPath unchanged when rootPath is null", () => {
    expect(shortPath("/src/utils/paths.ts", null)).toBe("/src/utils/paths.ts");
  });
});
