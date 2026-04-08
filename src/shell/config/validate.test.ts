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
const DEFAULT_FLOOR = 0.9;
const DEFAULT_GROUP = 4;
const VALID_SENSITIVITY = 1.5;
const VALID_FLOOR = 0.8;
const VALID_GROUP = 5;

/** Builds a valid baseline config for clamp tests. */
function validConfig(): {
  sensitivity: number;
  containmentFloor: number;
  minGroup: number;
} {
  return {
    sensitivity: VALID_SENSITIVITY,
    containmentFloor: VALID_FLOOR,
    minGroup: VALID_GROUP,
  };
}

describe("clampAudits", () => {
  it("keeps valid values unchanged", () => {
    const { config, warnings } = clampAudits(validConfig());
    expect(warnings).toHaveLength(ZERO);
    expect(config.sensitivity).toBe(VALID_SENSITIVITY);
    expect(config.containmentFloor).toBe(VALID_FLOOR);
    expect(config.minGroup).toBe(VALID_GROUP);
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

  it("clamps containmentFloor above 1 to default", () => {
    const OVER = 1.5;
    const { config, warnings } = clampAudits({ ...validConfig(), containmentFloor: OVER });
    expect(config.containmentFloor).toBe(DEFAULT_FLOOR);
    expect(warnings[ZERO]).toContain("containmentFloor must be between 0 and 1");
  });

  it("clamps negative containmentFloor to default", () => {
    const NEG = -0.1;
    const { config, warnings } = clampAudits({ ...validConfig(), containmentFloor: NEG });
    expect(config.containmentFloor).toBe(DEFAULT_FLOOR);
    expect(warnings).toHaveLength(ONE);
  });

  it("accepts containmentFloor of 0", () => {
    const { config, warnings } = clampAudits({ ...validConfig(), containmentFloor: ZERO });
    expect(config.containmentFloor).toBe(ZERO);
    expect(warnings).toHaveLength(ZERO);
  });

  it("clamps fractional minGroup to default", () => {
    const FRAC = 2.5;
    const { config, warnings } = clampAudits({ ...validConfig(), minGroup: FRAC });
    expect(config.minGroup).toBe(DEFAULT_GROUP);
    expect(warnings[ZERO]).toContain("minGroup must be a positive integer");
  });

  it("clamps zero minGroup to default", () => {
    const { config, warnings } = clampAudits({ ...validConfig(), minGroup: ZERO });
    expect(config.minGroup).toBe(DEFAULT_GROUP);
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
