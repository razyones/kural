import { clampAudits, validateConfig } from "./validate.ts";
import { describe, expect, it } from "vite-plus/test";

const ZERO = 0;
const ONE = 1;
const NON_OBJECT_VALUE = 1;

/** Reads a field from the sanitized audits sub-object without type assertion. */
function auditField(config: Record<string, unknown>, key: string): unknown {
  const audits = config.audits;
  if (typeof audits !== "object" || audits === null || Array.isArray(audits)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(audits, key)?.value;
}

const DEFAULT_SENSITIVITY = 2.0;
const VALID_SENSITIVITY = 1.5;

/** Builds a valid baseline config for clamp tests. */
function validConfig(): {
  sensitivity: number;
} {
  return {
    sensitivity: VALID_SENSITIVITY,
  };
}

describe("clampAudits", () => {
  it("keeps valid values unchanged", () => {
    const { config, warnings } = clampAudits(validConfig());
    expect(warnings).toHaveLength(ZERO);
    expect(config.sensitivity).toBe(VALID_SENSITIVITY);
  });

  it("clamps negative sensitivity to default", () => {
    const { config, warnings } = clampAudits({ ...validConfig(), sensitivity: -ONE });
    expect(config.sensitivity).toBe(DEFAULT_SENSITIVITY);
    expect(warnings).toHaveLength(ONE);
    expect(warnings[ZERO]).toContain("sensitivity must be positive");
  });

  it("clamps zero sensitivity to default", () => {
    const { config, warnings } = clampAudits({ ...validConfig(), sensitivity: ZERO });
    expect(config.sensitivity).toBe(DEFAULT_SENSITIVITY);
    expect(warnings).toHaveLength(ONE);
  });

  it("preserves disable field", () => {
    const { config } = clampAudits({ ...validConfig(), disable: ["outliers"] });
    expect(config.disable).toEqual(["outliers"]);
  });
});

describe("validateConfig — non-object roots", () => {
  it("rejects null", () => {
    const { config, warnings } = validateConfig(null);
    expect(Object.keys(config)).toHaveLength(ZERO);
    expect(warnings).toHaveLength(ONE);
    expect(warnings[ZERO]).toContain("not a JSON object");
  });

  it("rejects an array", () => {
    const { warnings } = validateConfig([]);
    expect(warnings[ZERO]).toContain("not a JSON object");
  });

  it("rejects a string", () => {
    const { warnings } = validateConfig("hello");
    expect(warnings[ZERO]).toContain("not a JSON object");
  });

  it("passes an empty object through unchanged", () => {
    const { config, warnings } = validateConfig({});
    expect(warnings).toHaveLength(ZERO);
    expect(config).toEqual({});
  });
});

describe("validateConfig — audits.sensitivity", () => {
  it("strips negative sensitivity", () => {
    const { config, warnings } = validateConfig({ audits: { sensitivity: -1 } });
    expect(warnings[ZERO]).toContain("sensitivity must be positive");
    expect(auditField(config, "sensitivity")).toBeUndefined();
  });

  it("strips zero sensitivity", () => {
    const { config, warnings } = validateConfig({ audits: { sensitivity: 0 } });
    expect(warnings).toHaveLength(ONE);
    expect(auditField(config, "sensitivity")).toBeUndefined();
  });

  it("keeps valid sensitivity", () => {
    const VALID = 2.5;
    const { config, warnings } = validateConfig({ audits: { sensitivity: VALID } });
    expect(warnings).toHaveLength(ZERO);
    expect(auditField(config, "sensitivity")).toBe(VALID);
  });
});

describe("validateConfig — audits.disable", () => {
  it("strips non-array disable", () => {
    const { config, warnings } = validateConfig({ audits: { disable: "outliers" } });
    expect(warnings[ZERO]).toContain("disable must be an array");
    expect(auditField(config, "disable")).toBeUndefined();
  });

  it("keeps valid disable array", () => {
    const { warnings } = validateConfig({ audits: { disable: ["outliers"] } });
    expect(warnings).toHaveLength(ZERO);
  });

  it("filters non-string items and warns", () => {
    const { config, warnings } = validateConfig({
      audits: { disable: ["valid", NON_OBJECT_VALUE, null] },
    });
    expect(auditField(config, "disable")).toEqual(["valid"]);
    expect(warnings[ZERO]).toContain("non-string items");
  });
});

describe("validateConfig — domainKeywords", () => {
  it("strips non-array domainKeywords", () => {
    const { config, warnings } = validateConfig({ domainKeywords: "oops" });
    expect(warnings[ZERO]).toContain("domainKeywords must be an array");
    expect(config.domainKeywords).toBeUndefined();
  });

  it("warns on empty domainKeywords", () => {
    const { config, warnings } = validateConfig({ domainKeywords: [] });
    expect(warnings[ZERO]).toContain("domainKeywords is empty");
    expect(config.domainKeywords).toEqual([]);
  });
});

describe("validateConfig — dictionary", () => {
  it("strips non-object dictionary", () => {
    const { config, warnings } = validateConfig({ dictionary: [NON_OBJECT_VALUE] });
    expect(warnings[ZERO]).toContain("dictionary must be an object");
    expect(config.dictionary).toBeUndefined();
  });

  it("warns on empty dictionary", () => {
    const { config, warnings } = validateConfig({ dictionary: {} });
    expect(warnings[ZERO]).toContain("dictionary is empty");
    expect(config.dictionary).toEqual({});
  });

  it("keeps valid dictionary", () => {
    const { warnings } = validateConfig({ dictionary: { kural: "structural score" } });
    expect(warnings).toHaveLength(ZERO);
  });
});
