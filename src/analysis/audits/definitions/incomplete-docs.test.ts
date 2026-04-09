import { NONE, ONE, SENSITIVITY, THREE, TWO } from "../../../../tests/constants/audits.ts";
import { describe, expect, test } from "vite-plus/test";
import {
  makeDir,
  makeFile,
  makeFormatCtx,
  makeFunction,
  makeType,
  suppress,
  toNodeMap,
} from "../../../../tests/helpers/audits.ts";
import { createContext } from "../context.ts";
import incompleteDocs from "./incomplete-docs.ts";
const CONFIG = {
  sensitivity: SENSITIVITY,
};

describe("incomplete-docs detect — function nodes", () => {
  test("flags function missing description", () => {
    const fn = makeFunction({ description: undefined });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(ONE);
    expect(findings[NONE].missing).toContain("description");
  });

  test("flags function with empty description", () => {
    const fn = makeFunction({ description: "   " });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings[NONE].missing).toContain("description");
  });

  test("flags function with undocumented params", () => {
    const fn = makeFunction({
      paramNames: ["a", "b"],
      documentedParams: ONE,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    const paramMissing = findings[NONE].missing?.find((m) => m.includes("@param"));
    expect(paramMissing).toBeDefined();
  });

  test("flags function missing @returns for non-void return", () => {
    const fn = makeFunction({
      description: "Does stuff",
      returnsType: "string",
      hasReturnDoc: false,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings[NONE].missing).toContain("@returns");
  });
});

describe("incomplete-docs detect — purity annotation", () => {
  test("flags impure function missing @kuralPure or @kuralCauses", () => {
    const fn = makeFunction({
      description: "Does stuff",
      pure: false,
      causes: undefined,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings[NONE].missing).toContain("@kuralPure or @kuralCauses");
  });

  test("does not flag pure function", () => {
    const fn = makeFunction({
      description: "Does stuff",
      pure: true,
      causes: undefined,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);
    const purityMissing = findings.some(
      (f) => f.missing?.includes("@kuralPure or @kuralCauses") === true,
    );

    expect(purityMissing).toBe(false);
  });

  test("does not flag function with @kuralCauses", () => {
    const fn = makeFunction({
      description: "Does stuff",
      pure: false,
      causes: "writes to DB",
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);
    const purityMissing = findings.some(
      (f) => f.missing?.includes("@kuralPure or @kuralCauses") === true,
    );

    expect(purityMissing).toBe(false);
  });
});

describe("incomplete-docs detect — type and file nodes", () => {
  test("flags type missing description", () => {
    const ty = makeType({ description: undefined });
    const nodes = toNodeMap(ty);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings[NONE].missing).toContain("description");
  });

  test("flags file missing description", () => {
    const file = makeFile({ description: undefined });
    const nodes = toNodeMap(file);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings[NONE].missing).toContain("description");
  });

  test("flags directory missing description", () => {
    const dir = makeDir({ description: undefined });
    const nodes = toNodeMap(dir);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings[NONE].missing).toContain("description (KURAL.md)");
  });
});

describe("incomplete-docs detect — suppression and clean nodes", () => {
  test("does not flag fully documented function", () => {
    const fn = makeFunction({
      description: "Processes input",
      paramNames: ["a"],
      documentedParams: ONE,
      returnsType: "void",
      pure: true,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("respects suppression", () => {
    const fn = makeFunction({
      description: undefined,
      residuals: [suppress("incomplete-docs")],
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("returns empty for empty node map", () => {
    const nodes = toNodeMap();
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});

describe("incomplete-docs detect — multiple missing items", () => {
  test("aggregates all missing items for one function", () => {
    const fn = makeFunction({
      description: undefined,
      paramNames: ["x", "y"],
      documentedParams: NONE,
      returnsType: "number",
      hasReturnDoc: false,
      pure: false,
      causes: undefined,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);
    const missing = findings[NONE].missing ?? [];

    expect(missing).toContain("description");
    expect(missing).toContain("@returns");
    expect(missing).toContain("@kuralPure or @kuralCauses");
    expect(missing.length).toBeGreaterThanOrEqual(THREE);
  });
});

describe("incomplete-docs format", () => {
  test("includes missing items in details", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "incomplete-docs",
        key: "func:/src/app.ts:run",
        name: "run",
        hash: "abcd1234",
        missing: ["description", "@returns"],
      },
      prefix: "\u25B8",
      label: "run",
      location: " in app.ts",
    });
    const result = incompleteDocs.format(fctx);

    expect(result.heading).toContain("run");
    expect(result.heading).toContain("app.ts");
    expect(result.details[NONE]).toContain("description");
    expect(result.details[NONE]).toContain("@returns");
  });

  test("heading includes prefix and label", () => {
    const fctx = makeFormatCtx({
      finding: {
        audit: "incomplete-docs",
        key: "type:T",
        name: "T",
        hash: "a1b2c3d4",
        missing: ["description"],
      },
      prefix: ">",
      label: "MyType",
      location: "",
    });
    const result = incompleteDocs.format(fctx);

    expect(result.heading).toContain(">");
    expect(result.heading).toContain("MyType");
  });
});

describe("incomplete-docs detect — void return not flagged", () => {
  test("does not flag @returns for void return type", () => {
    const fn = makeFunction({
      description: "Does stuff",
      returnsType: "void",
      hasReturnDoc: false,
      pure: true,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("does not flag @returns when already documented", () => {
    const fn = makeFunction({
      description: "Does stuff",
      returnsType: "number",
      hasReturnDoc: true,
      pure: true,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings.length).toBe(NONE);
  });

  test("does not flag @param when all params documented", () => {
    const fn = makeFunction({
      description: "Does stuff",
      paramNames: ["a", "b"],
      documentedParams: TWO,
      pure: true,
    });
    const nodes = toNodeMap(fn);
    const ctx = createContext(nodes, CONFIG);
    const findings = incompleteDocs.detect(ctx);

    expect(findings.length).toBe(NONE);
  });
});
