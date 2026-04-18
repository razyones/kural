import { collapseSignature, highlightSignature } from "./highlight.ts";
import { describe, expect, test } from "vite-plus/test";

describe("collapseSignature", () => {
  test("replaces a block param type with an ellipsis brace", () => {
    const sig = "(values: { a?: string; b?: string }) => Promise<void>";
    expect(collapseSignature(sig)).toBe("(values: {\u2026}) => Promise<void>");
  });

  test("leaves signatures without braces untouched", () => {
    expect(collapseSignature("(a: number) => boolean")).toBe("(a: number) => boolean");
  });

  test("collapses multiple block-typed params independently", () => {
    const sig = "(a: { x: string }, b: { y: number }) => void";
    expect(collapseSignature(sig)).toBe("(a: {\u2026}, b: {\u2026}) => void");
  });

  test("collapses nested braces to one placeholder", () => {
    const sig = "(config: { nested: { deep: string } }) => void";
    expect(collapseSignature(sig)).toBe("(config: {\u2026}) => void");
  });
});

describe("highlightSignature", () => {
  test("returns the signature with all identifiers preserved", () => {
    const out = highlightSignature("(name: string, count: number) => Promise<boolean>");
    expect(out).toContain("name");
    expect(out).toContain("string");
    expect(out).toContain("Promise");
  });

  test("ignores illegal syntax instead of throwing", () => {
    expect(() => highlightSignature("(values: {\u2026}) => void")).not.toThrow();
  });
});
