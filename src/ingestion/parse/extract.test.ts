import { describe, expect, it } from "vite-plus/test";
import { extractFile } from "./extract.ts";
import { resolve } from "node:path";

const SINGLE = 1;

const fixturesDir = resolve(import.meta.dirname, "../../../tests/fixtures/sample-project");
const localFixturesDir = resolve(import.meta.dirname, "../../../tests/fixtures/parse");

describe("extractFile types", () => {
  it("extracts exported record types with fields", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.types["User"]).toBeDefined();
    expect(result.types["User"].fields).toEqual({
      name: "string",
      age: "number",
      posts: "Post[]",
    });
    expect(result.types["User"].exported).toBe(true);
  });

  it("extracts unexported record types", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.types["InternalConfig"]).toBeDefined();
    expect(result.types["InternalConfig"].exported).toBe(false);
    expect(result.types["InternalConfig"].fields).toEqual({
      retryCount: "number",
      timeout: "number",
    });
  });

  it("extracts type description from JSDoc", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.types["User"].description).toBe("Represents a registered user in the system");
  });

  it("extracts cross-module type references", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.types["User"].references).toContain("./post.ts");
  });
});

describe("extractFile function extraction", () => {
  it("extracts exported functions with params and return type", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));
    const fn = result.functions["createUser"];

    expect(fn).toBeDefined();
    expect(fn.params).toEqual(["string", "number"]);
    expect(fn.paramNames).toEqual(["name", "age"]);
    expect(fn.returns).toBe("User");
    expect(fn.exported).toBe(true);
  });

  it("extracts unexported functions", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.functions["validateAge"]).toBeDefined();
    expect(result.functions["validateAge"].exported).toBe(false);
  });

  it("extracts async function return types", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.functions["welcomeUser"].returns).toBe("Promise<void>");
  });
});

describe("extractFile function annotations", () => {
  it("extracts @kuralPure tag", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.functions["createUser"].pure).toBe(true);
    expect(result.functions["welcomeUser"].pure).toBe(false);
  });

  it("extracts @kuralCauses tag", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.functions["welcomeUser"].causes).toBe("Sends an email via the SMTP gateway");
    expect(result.functions["createUser"].causes).toBeUndefined();
  });

  it("extracts @kuralUtil tag", () => {
    const result = extractFile(resolve(fixturesDir, "post.ts"));

    expect(result.functions["formatPost"].util).toBe(true);
  });

  it("extracts function description from JSDoc", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.functions["createUser"].description).toBe(
      "Creates a new user with the given name and age.",
    );
  });
});

describe("extractFile imports", () => {
  it("extracts internal imports", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.imports.internalImports).toContain("./post.ts");
  });

  it("extracts external imports", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.imports.externalImports).toContain("zod");
  });

  it("returns empty arrays when no imports", () => {
    const result = extractFile(resolve(fixturesDir, "utils/math.ts"));

    expect(result.imports.internalImports).toEqual([]);
    expect(result.imports.externalImports).toEqual([]);
  });
});

describe("extractFile util propagation from path conventions", () => {
  it("propagates util to all functions in a utils/ directory", () => {
    const result = extractFile(resolve(fixturesDir, "utils/format.ts"));

    expect(result.functions["capitalize"].util).toBe(true);
  });

  it("propagates util to all types in a utils/ directory", () => {
    const result = extractFile(resolve(fixturesDir, "utils/format.ts"));

    expect(result.types["FormatConfig"].util).toBe(true);
  });

  it("propagates util to functions in a helpers/ directory", () => {
    const result = extractFile(resolve(fixturesDir, "helpers/strings.ts"));

    expect(result.functions["normalize"].util).toBe(true);
  });

  it("propagates util to functions in .utils. files", () => {
    const result = extractFile(resolve(fixturesDir, "date.utils.ts"));

    expect(result.functions["formatDate"].util).toBe(true);
  });

  it("propagates util to types in .utils. files", () => {
    const result = extractFile(resolve(fixturesDir, "date.utils.ts"));

    expect(result.types["DateRange"].util).toBe(true);
  });
});

describe("extractFile util propagation from JSDoc tags", () => {
  it("propagates util via file-level @kuralUtil tag", () => {
    const result = extractFile(resolve(fixturesDir, "logging.ts"));

    expect(result.functions["logWithTime"].util).toBe(true);
    expect(result.types["LogLevel"].util).toBe(true);
  });

  it("does not flag functions in regular files without @kuralUtil", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.functions["createUser"].util).toBe(false);
  });

  it("declaration-level @kuralUtil still works independently", () => {
    const result = extractFile(resolve(fixturesDir, "post.ts"));

    expect(result.functions["formatPost"].util).toBe(true);
    expect(result.types["Post"].util).toBe(false);
  });
});

describe("extractFile metadata", () => {
  it("extracts file name and path", () => {
    const filePath = resolve(fixturesDir, "user.ts");
    const result = extractFile(filePath);

    expect(result.name).toBe("user.ts");
    expect(result.path).toBe(filePath);
  });

  it("extracts file-level JSDoc description", () => {
    const result = extractFile(resolve(fixturesDir, "user.ts"));

    expect(result.description).toBe("User domain model and operations.");
  });
});

describe("extractFile interface declarations", () => {
  it("extracts exported interface as a KuralType", () => {
    const result = extractFile(resolve(localFixturesDir, "interface.ts"));

    expect(result.types["Greeter"]).toBeDefined();
    expect(result.types["Greeter"].exported).toBe(true);
    expect(result.types["Greeter"].fields).toEqual({
      name: "string",
      greeting: "string",
    });
  });

  it("extracts multiple interfaces from one file", () => {
    const result = extractFile(resolve(localFixturesDir, "interface.ts"));

    expect(result.types["InternalOptions"]).toBeDefined();
    expect(result.types["InternalOptions"].exported).toBe(true);
    expect(result.types["InternalOptions"].fields).toEqual({
      verbose: "boolean",
      timeout: "number",
    });
  });
});

describe("extractFile declare functions and call dedup", () => {
  it("returns empty calls for a declare function with no body", () => {
    const result = extractFile(resolve(localFixturesDir, "declare-fn.ts"));
    const fn = result.functions["ambientFn"];

    expect(fn).toBeDefined();
    expect(fn.calls).toEqual([]);
  });

  it("deduplicates repeated calls to the same function", () => {
    const result = extractFile(resolve(localFixturesDir, "declare-fn.ts"));
    const fn = result.functions["callerWithDupes"];

    expect(fn).toBeDefined();
    expect(fn.calls).toEqual(["helper"]);
    expect(fn.calls).toHaveLength(SINGLE);
  });
});

describe("extractFile auto-detects inward-bound barrel exports", () => {
  it("sets bound to inward for index.ts with no functions or types", () => {
    const result = extractFile(resolve(localFixturesDir, "index.ts"));

    expect(result.bound).toBe("inward");
  });

  it("does not set bound on regular files", () => {
    const result = extractFile(resolve(localFixturesDir, "sample.ts"));

    expect(result.bound).toBeUndefined();
  });
});
