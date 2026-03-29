import { describe, expect, it } from "vite-plus/test";
import { extractSymbolInfos } from "./langservice.ts";
import { join } from "node:path";

const NONE = 0;
const FIXTURE_DIR = join(import.meta.dirname, "../../../tests/fixtures/parse");

/** Safely gets a SymbolInfo from the map, failing the test if absent. */
function getInfo(
  infos: ReturnType<typeof extractSymbolInfos>,
  name: string,
): NonNullable<ReturnType<ReturnType<typeof extractSymbolInfos>["get"]>> {
  const info = infos.get(name);
  if (info === undefined) {
    throw new Error(`Expected symbol "${name}" to exist`);
  }
  return info;
}

describe("extractSymbolInfos functions", () => {
  it("extracts function display parts", () => {
    const infos = extractSymbolInfos(join(FIXTURE_DIR, "sample.ts"));
    const info = getInfo(infos, "greet");

    expect(info.displayParts.length).toBeGreaterThan(NONE);
    const kinds = info.displayParts.map((p) => p.kind);
    expect(kinds).toContain("functionName");
    expect(kinds).toContain("parameterName");
  });

  it("captures JSDoc documentation", () => {
    const infos = extractSymbolInfos(join(FIXTURE_DIR, "sample.ts"));
    const info = getInfo(infos, "greet");
    expect(info.documentation).toContain("Greets");
  });

  it("captures JSDoc tags", () => {
    const infos = extractSymbolInfos(join(FIXTURE_DIR, "sample.ts"));
    const info = getInfo(infos, "greet");
    const tagNames = info.tags.map((t) => t.name);
    expect(tagNames).toContain("param");
    expect(tagNames).toContain("returns");
  });
});

describe("extractSymbolInfos types", () => {
  it("extracts type display parts", () => {
    const infos = extractSymbolInfos(join(FIXTURE_DIR, "sample.ts"));
    const info = getInfo(infos, "User");

    expect(info.displayParts.length).toBeGreaterThan(NONE);
    const kinds = info.displayParts.map((p) => p.kind);
    expect(kinds).toContain("aliasName");
    expect(kinds).toContain("propertyName");
  });
});

describe("extractSymbolInfos edge cases", () => {
  it("returns empty map for file with no declarations", () => {
    const infos = extractSymbolInfos(join(FIXTURE_DIR, "empty.ts"));
    expect(infos.size).toBe(NONE);
  });
});
