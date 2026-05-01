import type { KuralDirectory, KuralFile, KuralFunction, KuralType } from "../parse/types.ts";
import { describe, expect, it } from "vite-plus/test";
import {
  directoryLeafSignature,
  directorySignature,
  fileLeafSignature,
  fileSignature,
  functionLeafSignature,
  functionSignature,
  identitySignature,
  typeLeafSignature,
  typeSignature,
} from "./signatures.ts";

const EMPTY: number[] = [];
const FIRST_LINE = 1;

function makeType(overrides: Partial<KuralType> & { name: string }): KuralType {
  return {
    path: `/test/${overrides.name}.ts`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    fields: {},
    exported: false,
    references: [],
    util: false,
    helper: false,
    residuals: [],
    startLine: FIRST_LINE,
    endLine: FIRST_LINE,
    ...overrides,
  };
}

function makeFunction(overrides: Partial<KuralFunction> & { name: string }): KuralFunction {
  return {
    path: `/test/${overrides.name}.ts`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    params: [],
    paramNames: [],
    returns: "void",
    exported: false,
    pure: false,
    util: false,
    residuals: [],
    calls: [],
    helper: false,
    documentedParams: 0,
    hasReturnDoc: false,
    startLine: FIRST_LINE,
    endLine: FIRST_LINE,
    ...overrides,
  };
}

function makeFile(overrides: Partial<KuralFile> & { name: string }): KuralFile {
  return {
    path: `/test/${overrides.name}`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    functions: {},
    types: {},
    imports: { internalImports: [], externalImports: [] },
    helper: false,
    residuals: [],
    ...overrides,
  };
}

function makeDirectory(overrides: Partial<KuralDirectory> & { name: string }): KuralDirectory {
  return {
    path: `/test/${overrides.name}`,
    identityEmbedding: EMPTY,
    leafEmbedding: EMPTY,
    children: [],
    residuals: [],
    util: false,
    ...overrides,
  };
}

describe("identitySignature", () => {
  it("combines name and description", () => {
    expect(identitySignature("User", "A registered user")).toBe("User: A registered user");
  });

  it("returns just name when no description", () => {
    expect(identitySignature("User")).toBe("User");
  });

  it("returns just name when description is empty", () => {
    expect(identitySignature("User", "")).toBe("User");
  });
});

describe("typeLeafSignature", () => {
  it("appends field names and types", () => {
    const type = makeType({
      name: "User",
      description: "A user",
      fields: { name: "string", age: "number" },
    });
    expect(typeLeafSignature(type)).toBe("User: A user | fields: name (string), age (number)");
  });

  it("returns identity when no fields", () => {
    const type = makeType({ name: "Empty", fields: {} });
    expect(typeLeafSignature(type)).toBe("Empty");
  });
});

describe("functionLeafSignature", () => {
  it("appends params and return type", () => {
    const fn = makeFunction({
      name: "createUser",
      description: "Creates a user",
      params: ["string", "number"],
      paramNames: ["name", "age"],
      returns: "User",
    });
    expect(functionLeafSignature(fn)).toBe(
      "createUser: Creates a user | params: name (string), age (number) | returns: User",
    );
  });

  it("shows only returns when no params", () => {
    const fn = makeFunction({
      name: "getAll",
      params: [],
      paramNames: [],
      returns: "User[]",
    });
    expect(functionLeafSignature(fn)).toBe("getAll | returns: User[]");
  });
});

describe("fileLeafSignature", () => {
  it("appends exported names", () => {
    const file = makeFile({
      name: "user.ts",
      description: "User module",
      types: { User: makeType({ name: "User", exported: true }) },
      functions: {
        createUser: makeFunction({ name: "createUser", exported: true }),
        validateAge: makeFunction({ name: "validateAge", exported: false }),
      },
    });
    expect(fileLeafSignature(file)).toBe("user.ts: User module | exports: User, createUser");
  });

  it("returns identity when no exports", () => {
    const file = makeFile({
      name: "internal.ts",
      functions: { helper: makeFunction({ name: "helper", exported: false }) },
    });
    expect(fileLeafSignature(file)).toBe("internal.ts");
  });
});

describe("directoryLeafSignature", () => {
  it("appends child names from paths", () => {
    const dir = makeDirectory({
      name: "utils",
      description: "Utility functions",
      children: ["/project/utils/math.ts", "/project/utils/path.ts"],
    });
    expect(directoryLeafSignature(dir)).toBe(
      "utils: Utility functions | children: math.ts, path.ts",
    );
  });

  it("returns identity when no children", () => {
    const dir = makeDirectory({ name: "empty", children: [] });
    expect(directoryLeafSignature(dir)).toBe("empty");
  });
});

describe("typeSignature", () => {
  it("returns field structure without identity prefix", () => {
    const type = makeType({
      name: "User",
      description: "A user",
      fields: { name: "string", age: "number" },
    });
    expect(typeSignature(type)).toBe("fields: name (string), age (number)");
  });

  it("returns empty string when no fields", () => {
    const type = makeType({ name: "Empty", fields: {} });
    expect(typeSignature(type)).toBe("");
  });
});

describe("functionSignature", () => {
  it("returns params and return type without identity prefix", () => {
    const fn = makeFunction({
      name: "createUser",
      description: "Creates a user",
      params: ["string", "number"],
      paramNames: ["name", "age"],
      returns: "User",
    });
    expect(functionSignature(fn)).toBe("params: name (string), age (number) | returns: User");
  });

  it("returns only return type when no params", () => {
    const fn = makeFunction({
      name: "getAll",
      params: [],
      paramNames: [],
      returns: "User[]",
    });
    expect(functionSignature(fn)).toBe("returns: User[]");
  });
});

describe("fileSignature", () => {
  it("returns exports without identity prefix", () => {
    const file = makeFile({
      name: "user.ts",
      description: "User module",
      types: { User: makeType({ name: "User", exported: true }) },
      functions: {
        createUser: makeFunction({ name: "createUser", exported: true }),
        validateAge: makeFunction({ name: "validateAge", exported: false }),
      },
    });
    expect(fileSignature(file)).toBe("exports: User, createUser");
  });

  it("returns empty string when no exports", () => {
    const file = makeFile({
      name: "internal.ts",
      functions: { helper: makeFunction({ name: "helper", exported: false }) },
    });
    expect(fileSignature(file)).toBe("");
  });
});

describe("directorySignature", () => {
  it("returns children without identity prefix", () => {
    const dir = makeDirectory({
      name: "utils",
      description: "Utility functions",
      children: ["/project/utils/math.ts", "/project/utils/path.ts"],
    });
    expect(directorySignature(dir)).toBe("children: math.ts, path.ts");
  });

  it("returns empty string when no children", () => {
    const dir = makeDirectory({ name: "empty", children: [] });
    expect(directorySignature(dir)).toBe("");
  });
});
