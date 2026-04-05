import { describe, expect, it } from "vite-plus/test";
import { parse } from "./pipeline.ts";
import { resolve } from "node:path";

const ARRAY_FIRST = 0;
const ARRAY_SECOND = 1;
const SINGLE = 1;
const PAIR = 2;

const fixturesDir = resolve(import.meta.dirname, "../../../../tests/fixtures/sample-project");

describe("parse structure", () => {
  it("returns files keyed by path", async () => {
    const result = await parse(fixturesDir);

    const filePaths = Object.keys(result.files);
    expect(filePaths).toContain(resolve(fixturesDir, "user.ts"));
    expect(filePaths).toContain(resolve(fixturesDir, "post.ts"));
    expect(filePaths).toContain(resolve(fixturesDir, "utils/math.ts"));
  });

  it("returns directories keyed by path", async () => {
    const result = await parse(fixturesDir);

    expect(result.directories[fixturesDir]).toBeDefined();
    expect(result.directories[resolve(fixturesDir, "utils")]).toBeDefined();
  });

  it("root directory contains correct children", async () => {
    const result = await parse(fixturesDir);
    const root = result.directories[fixturesDir];

    expect(root.children).toContain(resolve(fixturesDir, "user.ts"));
    expect(root.children).toContain(resolve(fixturesDir, "post.ts"));
    expect(root.children).toContain(resolve(fixturesDir, "utils"));
  });

  it("subdirectory contains its child files", async () => {
    const result = await parse(fixturesDir);
    const utils = result.directories[resolve(fixturesDir, "utils")];

    expect(utils.children).toContain(resolve(fixturesDir, "utils/math.ts"));
  });
});

describe("parse metadata", () => {
  it("directory name is the folder name", async () => {
    const result = await parse(fixturesDir);

    expect(result.directories[fixturesDir].name).toBe("sample-project");
    expect(result.directories[resolve(fixturesDir, "utils")].name).toBe("utils");
  });

  it("parsed files contain extracted types and functions", async () => {
    const result = await parse(fixturesDir);
    const userFile = result.files[resolve(fixturesDir, "user.ts")];

    expect(userFile.types["User"]).toBeDefined();
    expect(userFile.functions["createUser"]).toBeDefined();
  });

  it("reads KURAL.md as directory description", async () => {
    const result = await parse(fixturesDir);
    const utils = result.directories[resolve(fixturesDir, "utils")];

    expect(utils.description).toBe(
      "The toolbox. Provides pure mathematical and path functions that multiple other modules depend on but that carry no application-specific meaning.",
    );
  });

  it("leaves description undefined when no KURAL.md exists", async () => {
    const result = await parse(fixturesDir);
    const root = result.directories[fixturesDir];

    expect(root.description).toBeUndefined();
  });

  it("parses @kuralResidual entries from KURAL.md", async () => {
    const result = await parse(fixturesDir);
    const helpers = result.directories[resolve(fixturesDir, "helpers")];

    expect(helpers.description).toBe("Shared string manipulation helpers used across modules.");
    expect(helpers.residuals).toHaveLength(PAIR);
    expect(helpers.residuals[ARRAY_FIRST]).toEqual({ audit: "merge-candidates", hash: "abc12345" });
    expect(helpers.residuals[ARRAY_SECOND]).toEqual({ audit: "outliers", hash: undefined });
  });
});

const edgeFixturesDir = resolve(import.meta.dirname, "../../../../tests/fixtures/pipeline-edge");
const borrowsFixturesDir = resolve(
  import.meta.dirname,
  "../../../../tests/fixtures/borrows-project",
);

describe("parse edge cases", () => {
  it("skips @kuralResidual lines with empty audit name", async () => {
    const result = await parse(edgeFixturesDir);
    const root = result.directories[edgeFixturesDir];

    // Only the valid residual should be parsed; the bare "@kuralResidual" is skipped
    expect(root.residuals).toHaveLength(SINGLE);
    expect(root.residuals[ARRAY_FIRST]).toEqual({ audit: "valid-name", hash: "hash123" });
  });

  it("returns undefined description when KURAL.md has only residual lines", async () => {
    const result = await parse(edgeFixturesDir);
    const root = result.directories[edgeFixturesDir];

    // All lines are @kuralResidual, so description should be undefined
    expect(root.description).toBeUndefined();
  });
});

describe("parse @kuralBorrows", () => {
  it("parses target and quoted role from KURAL.md", async () => {
    const result = await parse(borrowsFixturesDir);
    const root = result.directories[borrowsFixturesDir];

    expect(root.borrows).toEqual({
      target: "analysis/advise",
      role: "terminal surface that renders engine output as diagrams",
    });
  });

  it("parses borrows without target path", async () => {
    const result = await parse(borrowsFixturesDir);
    const commands = result.directories[resolve(borrowsFixturesDir, "commands")];

    expect(commands.borrows).toEqual({
      target: undefined,
      role: "terminal surface that renders path maps",
    });
  });

  it("strips @kuralBorrows line from description", async () => {
    const result = await parse(borrowsFixturesDir);
    const root = result.directories[borrowsFixturesDir];

    expect(root.description).toBe("The consultant's desk. Displays results on stdout.");
  });

  it("leaves borrows undefined when not present", async () => {
    const result = await parse(fixturesDir);
    const root = result.directories[fixturesDir];

    expect(root.borrows).toBeUndefined();
  });

  it("ignores @kuralBorrows without quotes", async () => {
    const result = await parse(borrowsFixturesDir);
    const noQuotes = result.directories[resolve(borrowsFixturesDir, "no-quotes")];

    expect(noQuotes.borrows).toBeUndefined();
  });

  it("ignores @kuralBorrows with empty quoted role", async () => {
    const result = await parse(borrowsFixturesDir);
    const emptyRole = result.directories[resolve(borrowsFixturesDir, "empty-role")];

    expect(emptyRole.borrows).toBeUndefined();
  });
});
