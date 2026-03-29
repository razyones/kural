import { describe, expect, it } from "vite-plus/test";
import { resolve } from "node:path";
import { walk } from "./walk.ts";

const fixturesDir = resolve(import.meta.dirname, "../../../tests/fixtures/sample-project");

describe("walk discovery", () => {
  it("returns all .ts files in a directory", async () => {
    const result = await walk(fixturesDir);

    expect(result.files).toContain(resolve(fixturesDir, "user.ts"));
    expect(result.files).toContain(resolve(fixturesDir, "post.ts"));
    expect(result.files).toContain(resolve(fixturesDir, "utils/math.ts"));
  });

  it("returns subdirectory paths", async () => {
    const result = await walk(fixturesDir);

    expect(result.directories).toContain(resolve(fixturesDir, "utils"));
  });

  it("returns the root directory path", async () => {
    const result = await walk(fixturesDir);

    expect(result.root).toBe(fixturesDir);
  });
});

describe("walk exclusions", () => {
  it("excludes non-ts files", async () => {
    const result = await walk(fixturesDir);

    for (const file of result.files) {
      expect(file).toMatch(/\.ts$/);
    }
  });

  it("excludes node_modules and hidden directories", async () => {
    const result = await walk(fixturesDir);

    for (const file of result.files) {
      expect(file).not.toContain("node_modules");
      expect(file).not.toMatch(/\/\./);
    }

    for (const dir of result.directories) {
      expect(dir).not.toContain("node_modules");
      expect(dir).not.toMatch(/\/\./);
    }
  });

  it("excludes .test.ts files", async () => {
    const parseDir = resolve(import.meta.dirname);
    const result = await walk(parseDir);

    for (const file of result.files) {
      expect(file).not.toMatch(/\.test\.ts$/);
    }
  });

  it("excludes __fixtures__ directories and their contents", async () => {
    const parseDir = resolve(import.meta.dirname);
    const result = await walk(parseDir);

    for (const file of result.files) {
      expect(file).not.toContain("__fixtures__");
    }

    for (const dir of result.directories) {
      expect(dir).not.toContain("__fixtures__");
    }
  });
});
