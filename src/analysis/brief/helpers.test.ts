import { DEFAULT_CAPS, fullDescription, relPath, roundSim, signatureOf } from "./helpers.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeFunction, makeType } from "../../../tests/helpers/audits.ts";

const EXPECTED_SIBLINGS = 5;
const RAW_SIM = 0.123_456_789;
const ROUNDED = 0.1235;

describe("DEFAULT_CAPS", () => {
  test("siblings cap defaults to 5", () => {
    expect(DEFAULT_CAPS.siblings).toBe(EXPECTED_SIBLINGS);
  });
});

describe("fullDescription", () => {
  test("returns empty for undefined", () => {
    const missing: string | undefined = undefined;
    expect(fullDescription(missing)).toBe("");
  });

  test("keeps every sentence including the exclusivity clause", () => {
    const text = "Binds CLI argument schemas. It is the only directory that...";
    expect(fullDescription(text)).toBe(text);
  });

  test("trims surrounding whitespace", () => {
    expect(fullDescription("   alpha beta   ")).toBe("alpha beta");
  });

  test("preserves paragraph breaks inside the description", () => {
    expect(fullDescription("alpha\n\nbeta")).toBe("alpha\n\nbeta");
  });
});

describe("relPath", () => {
  test("strips file: scheme and root prefix", () => {
    expect(relPath("file:/repo/src/foo.ts", "/repo")).toBe("src/foo.ts");
  });

  test("strips dir: scheme without root match", () => {
    expect(relPath("dir:/elsewhere/x", "/repo")).toBe("/elsewhere/x");
  });

  test("returns the input when it has no scheme", () => {
    expect(relPath("plain/path.ts", "/repo")).toBe("plain/path.ts");
  });

  test("extracts the file path from a compound pattern key", () => {
    expect(relPath("pattern:file:/repo/src/foo.ts:layerRouter", "/repo")).toBe("src/foo.ts");
  });
});

describe("roundSim", () => {
  test("rounds to four decimals", () => {
    expect(roundSim(RAW_SIM)).toBe(ROUNDED);
  });
});

describe("signatureOf", () => {
  test("formats function signature with named params", () => {
    const fn = makeFunction({
      paramNames: ["a", "b"],
      paramTypes: ["number", "string"],
      returnsType: "boolean",
    });
    expect(signatureOf(fn)).toBe("(a: number, b: string) => boolean");
  });

  test("returns empty for types", () => {
    const ty = makeType();
    expect(signatureOf(ty)).toBe("");
  });
});
