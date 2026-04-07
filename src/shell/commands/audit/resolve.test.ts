import { clampOrWarn, parseOr, resolveAuditConfig, resolveConfig } from "./resolve.ts";
import { describe, expect, it, vi } from "vite-plus/test";

const ZERO = 0;
const ONE = 1;
const NEG_ONE = -1;
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

describe("clampOrWarn", () => {
  it("returns value when valid", () => {
    const VALUE = 2.5;
    expect(clampOrWarn("test", VALUE, true, ZERO)).toBe(VALUE);
  });

  it("returns fallback when invalid", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const FALLBACK = 2.0;
    expect(clampOrWarn("sensitivity", NEG_ONE, false, FALLBACK)).toBe(FALLBACK);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("logs a warning with the field name and value", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const FALLBACK = 4;
    clampOrWarn("minGroup", ZERO, false, FALLBACK);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("minGroup"));
    spy.mockRestore();
  });
});

describe("resolveConfig", () => {
  it("uses CLI values over project config", () => {
    const PROJECT_SENS = 1.5;
    const CLI_SENS = 3.0;
    const result = resolveConfig({ sensitivity: "3.0" }, { sensitivity: PROJECT_SENS });
    expect(result.sensitivity).toBe(CLI_SENS);
  });

  it("falls back to project config when CLI is absent", () => {
    const PROJECT_SENS = 1.5;
    const result = resolveConfig({}, { sensitivity: PROJECT_SENS });
    expect(result.sensitivity).toBe(PROJECT_SENS);
  });

  it("falls back to defaults when both are absent", () => {
    const DEFAULT_SENSITIVITY = 2.0;
    const DEFAULT_FLOOR = 0.9;
    const DEFAULT_GROUP = 4;
    const result = resolveConfig({}, {});
    expect(result.sensitivity).toBe(DEFAULT_SENSITIVITY);
    expect(result.containmentFloor).toBe(DEFAULT_FLOOR);
    expect(result.minGroup).toBe(DEFAULT_GROUP);
  });

  it("clamps negative sensitivity to default", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const DEFAULT_SENSITIVITY = 2.0;
    const result = resolveConfig({ sensitivity: "-1" }, {});
    expect(result.sensitivity).toBe(DEFAULT_SENSITIVITY);
    spy.mockRestore();
  });

  it("clamps containmentFloor above 1 to default", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const DEFAULT_FLOOR = 0.9;
    const result = resolveConfig({ containmentFloor: "1.5" }, {});
    expect(result.containmentFloor).toBe(DEFAULT_FLOOR);
    spy.mockRestore();
  });

  it("accepts containmentFloor of 0", () => {
    const result = resolveConfig({ containmentFloor: "0" }, {});
    expect(result.containmentFloor).toBe(ZERO);
  });

  it("truncates fractional minGroup via parseInt", () => {
    const TRUNCATED = 2;
    const result = resolveConfig({ minGroup: "2.5" }, {});
    expect(result.minGroup).toBe(TRUNCATED);
  });

  it("passes through disable from project config", () => {
    const result = resolveConfig({}, { disable: ["outliers"] });
    expect(result.disable).toEqual(["outliers"]);
  });
});

vi.mock("../../config/loader.ts", () => ({
  loadProjectConfig: (): { audits: { sensitivity: number } } => ({
    audits: { sensitivity: MOCK_SENSITIVITY },
  }),
}));

describe("resolveAuditConfig", () => {
  it("merges CLI disable with config disable", () => {
    const { config, disabledAudits } = resolveAuditConfig({
      disable: "outliers,bloated-files",
    });
    expect(config.sensitivity).toBe(MOCK_SENSITIVITY);
    expect(disabledAudits.has("outliers")).toBe(true);
    expect(disabledAudits.has("bloated-files")).toBe(true);
  });

  it("returns empty disabled set when no disable specified", () => {
    const { disabledAudits } = resolveAuditConfig({});
    expect(disabledAudits.size).toBe(ZERO);
  });
});
