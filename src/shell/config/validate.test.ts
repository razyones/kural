import { describe, expect, it } from "vite-plus/test";
import { validateConfig } from "./validate.ts";

const ZERO = 0;
const ONE = 1;
const DUMMY = 1;

/** Reads a field from the sanitized audits sub-object without type assertion. */
function auditField(config: Record<string, unknown>, key: string): unknown {
  const audits = config.audits;
  if (typeof audits !== "object" || audits === null || Array.isArray(audits)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(audits, key)?.value;
}

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

describe("validateConfig — audits.containmentFloor", () => {
  it("strips negative floor", () => {
    const { config, warnings } = validateConfig({ audits: { containmentFloor: -0.1 } });
    expect(warnings[ZERO]).toContain("containmentFloor must be between 0 and 1");
    expect(auditField(config, "containmentFloor")).toBeUndefined();
  });

  it("strips floor above 1", () => {
    const OVER = 1.5;
    const { config, warnings } = validateConfig({ audits: { containmentFloor: OVER } });
    expect(warnings[ZERO]).toContain("containmentFloor must be between 0 and 1");
    expect(auditField(config, "containmentFloor")).toBeUndefined();
  });

  it("keeps boundary value 0", () => {
    const { warnings } = validateConfig({ audits: { containmentFloor: 0 } });
    expect(warnings).toHaveLength(ZERO);
  });

  it("keeps boundary value 1", () => {
    const { warnings } = validateConfig({ audits: { containmentFloor: 1 } });
    expect(warnings).toHaveLength(ZERO);
  });
});

describe("validateConfig — audits.minGroup", () => {
  it("strips zero minGroup", () => {
    const { config, warnings } = validateConfig({ audits: { minGroup: 0 } });
    expect(warnings[ZERO]).toContain("minGroup must be a positive integer");
    expect(auditField(config, "minGroup")).toBeUndefined();
  });

  it("strips fractional minGroup", () => {
    const FRAC = 2.5;
    const { config, warnings } = validateConfig({ audits: { minGroup: FRAC } });
    expect(warnings[ZERO]).toContain("minGroup must be a positive integer");
    expect(auditField(config, "minGroup")).toBeUndefined();
  });

  it("strips negative minGroup", () => {
    const { config, warnings } = validateConfig({ audits: { minGroup: -3 } });
    expect(warnings).toHaveLength(ONE);
    expect(auditField(config, "minGroup")).toBeUndefined();
  });

  it("keeps valid minGroup", () => {
    const VALID = 5;
    const { config, warnings } = validateConfig({ audits: { minGroup: VALID } });
    expect(warnings).toHaveLength(ZERO);
    expect(auditField(config, "minGroup")).toBe(VALID);
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
    const { config, warnings } = validateConfig({ dictionary: [DUMMY] });
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
