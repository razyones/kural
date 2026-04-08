import { describe, expect, it } from "vite-plus/test";
import { parseAuditFlags, parseFlags, parseOr } from "./parse-flags.ts";

const ZERO = 0;
const ONE = 1;
const MOCK_SENSITIVITY = 1.5;

describe("parseOr", () => {
  it("parses a valid float", () => {
    const EXPECTED = 3.5;
    expect(parseOr("3.5", ZERO)).toBe(EXPECTED);
  });

  it("returns fallback for undefined input", () => {
    const FALLBACK = 2.0;
    expect(parseOr(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for empty string", () => {
    const FALLBACK = 2.0;
    expect(parseOr("", FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for non-numeric string", () => {
    const FALLBACK = 4;
    expect(parseOr("abc", FALLBACK)).toBe(FALLBACK);
  });

  it("preserves zero as a valid parsed value", () => {
    expect(parseOr("0", ONE)).toBe(ZERO);
  });

  it("uses parseInt with radix when provided", () => {
    const RADIX = 10;
    const EXPECTED = 5;
    expect(parseOr("5", ZERO, RADIX)).toBe(EXPECTED);
  });

  it("truncates floats when radix is provided", () => {
    const RADIX = 10;
    const EXPECTED = 2;
    expect(parseOr("2.9", ZERO, RADIX)).toBe(EXPECTED);
  });
});

describe("parseFlags", () => {
  it("uses CLI values over project config", () => {
    const PROJECT_SENS = 1.5;
    const CLI_SENS = 3.0;
    const result = parseFlags({ sensitivity: "3.0" }, { sensitivity: PROJECT_SENS });
    expect(result.sensitivity).toBe(CLI_SENS);
  });

  it("falls back to project config when CLI is absent", () => {
    const PROJECT_SENS = 1.5;
    const result = parseFlags({}, { sensitivity: PROJECT_SENS });
    expect(result.sensitivity).toBe(PROJECT_SENS);
  });

  it("falls back to defaults when both are absent", () => {
    const DEFAULT_SENSITIVITY = 2.0;
    const result = parseFlags({}, {});
    expect(result.sensitivity).toBe(DEFAULT_SENSITIVITY);
  });

  it("passes through negative sensitivity without clamping", () => {
    const result = parseFlags({ sensitivity: "-1" }, {});
    expect(result.sensitivity).toBe(-ONE);
  });

  it("passes through disable from project config", () => {
    const result = parseFlags({}, { disable: ["outliers"] });
    expect(result.disable).toEqual(["outliers"]);
  });
});

describe("parseAuditFlags", () => {
  it("merges CLI disable with config disable", () => {
    const { config, disabledAudits } = parseAuditFlags(
      { disable: "outliers,bloated-files" },
      { sensitivity: MOCK_SENSITIVITY },
    );
    expect(config.sensitivity).toBe(MOCK_SENSITIVITY);
    expect(disabledAudits.has("outliers")).toBe(true);
    expect(disabledAudits.has("bloated-files")).toBe(true);
  });

  it("returns empty disabled set when no disable specified", () => {
    const { disabledAudits } = parseAuditFlags({}, {});
    expect(disabledAudits.size).toBe(ZERO);
  });

  it("includes baselines.disable in disabledAudits", () => {
    const { disabledAudits } = parseAuditFlags({}, { disable: ["from-config"] });
    expect(disabledAudits.has("from-config")).toBe(true);
  });

  it("merges baselines.disable with CLI disable", () => {
    const { disabledAudits } = parseAuditFlags(
      { disable: "outliers" },
      { disable: ["from-config"] },
    );
    expect(disabledAudits.has("outliers")).toBe(true);
    expect(disabledAudits.has("from-config")).toBe(true);
  });
});
