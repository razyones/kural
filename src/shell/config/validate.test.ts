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

const VALID_CAP = 5;
const INVALID_FRACTIONAL_CAP = 2.5;

/** Reads a field from the sanitized brief sub-object without type assertion. */
function briefField(config: Record<string, unknown>, key: string): unknown {
  const brief = config.brief;
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(brief, key)?.value;
}

describe("validateConfig — brief caps", () => {
  it("rejects non-object brief", () => {
    const { config, warnings } = validateConfig({ brief: "oops" });
    expect(warnings[ZERO]).toContain("brief must be an object");
    expect(config.brief).toBeUndefined();
  });

  it("keeps positive integer caps", () => {
    const { config, warnings } = validateConfig({ brief: { siblings: VALID_CAP } });
    expect(warnings).toHaveLength(ZERO);
    expect(briefField(config, "siblings")).toBe(VALID_CAP);
  });

  it("accepts zero as a valid cap to disable a section", () => {
    const { config, warnings } = validateConfig({ brief: { utilities: ZERO } });
    expect(warnings).toHaveLength(ZERO);
    expect(briefField(config, "utilities")).toBe(ZERO);
  });

  it("strips negative caps and warns", () => {
    const NEGATIVE_CAP = -ONE;
    const { config, warnings } = validateConfig({ brief: { utilities: NEGATIVE_CAP } });
    expect(warnings[ZERO]).toContain("brief.utilities must be a non-negative integer");
    expect(briefField(config, "utilities")).toBeUndefined();
  });

  it("strips fractional caps and warns", () => {
    const { warnings } = validateConfig({ brief: { symbols: INVALID_FRACTIONAL_CAP } });
    expect(warnings[ZERO]).toContain("brief.symbols must be a non-negative integer");
  });

  it("strips unknown keys and warns", () => {
    const { config, warnings } = validateConfig({ brief: { mystery: VALID_CAP } });
    expect(warnings[ZERO]).toContain("brief.mystery is not a recognized cap");
    expect(briefField(config, "mystery")).toBeUndefined();
  });
});

/** Reads a field from the sanitized llm sub-object without type assertion. */
function llmField(config: Record<string, unknown>, key: string): unknown {
  const llm = config.llm;
  if (typeof llm !== "object" || llm === null || Array.isArray(llm)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(llm, key)?.value;
}

describe("validateConfig — llm", () => {
  it("strips non-object llm and warns", () => {
    const { config, warnings } = validateConfig({ llm: "oops" });
    expect(warnings[ZERO]).toContain("llm must be an object");
    expect(config.llm).toBeUndefined();
  });

  it("strips llm missing gateway and warns", () => {
    const { config, warnings } = validateConfig({ llm: { model: "anthropic/claude-sonnet-4-5" } });
    expect(warnings[ZERO]).toContain("llm.gateway is required");
    expect(config.llm).toBeUndefined();
  });

  it("strips llm with unknown gateway and warns", () => {
    const { config, warnings } = validateConfig({ llm: { gateway: "bogus" } });
    expect(warnings[ZERO]).toContain("llm.gateway must be one of");
    expect(config.llm).toBeUndefined();
  });

  it("strips llm with non-string gateway and warns", () => {
    const { config, warnings } = validateConfig({ llm: { gateway: NON_OBJECT_VALUE } });
    expect(warnings[ZERO]).toContain("llm.gateway must be one of");
    expect(config.llm).toBeUndefined();
  });

  it("keeps a valid minimal llm config", () => {
    const { config, warnings } = validateConfig({ llm: { gateway: "vercel" } });
    expect(warnings).toHaveLength(ZERO);
    expect(llmField(config, "gateway")).toBe("vercel");
  });

  it("keeps a fully-populated valid llm config", () => {
    const full = {
      gateway: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
    };
    const { config, warnings } = validateConfig({ llm: full });
    expect(warnings).toHaveLength(ZERO);
    expect(llmField(config, "model")).toBe(full.model);
    expect(llmField(config, "baseURL")).toBe(full.baseURL);
    expect(llmField(config, "apiKey")).toBe(full.apiKey);
  });

  it("strips non-string model and warns but keeps rest", () => {
    const { config, warnings } = validateConfig({
      llm: { gateway: "vercel", model: NON_OBJECT_VALUE },
    });
    expect(warnings[ZERO]).toContain("llm.model must be a string");
    expect(llmField(config, "gateway")).toBe("vercel");
    expect(llmField(config, "model")).toBeUndefined();
  });

  it("strips non-string baseURL and warns", () => {
    const { config, warnings } = validateConfig({
      llm: { gateway: "vercel", baseURL: NON_OBJECT_VALUE },
    });
    expect(warnings[ZERO]).toContain("llm.baseURL must be a string");
    expect(llmField(config, "baseURL")).toBeUndefined();
  });

  it("strips non-string apiKey and warns", () => {
    const { config, warnings } = validateConfig({
      llm: { gateway: "vercel", apiKey: NON_OBJECT_VALUE },
    });
    expect(warnings[ZERO]).toContain("llm.apiKey must be a string");
    expect(llmField(config, "apiKey")).toBeUndefined();
  });

  it("accepts every supported gateway", () => {
    for (const gateway of ["openrouter", "vercel", "ollama"] as const) {
      const { config, warnings } = validateConfig({ llm: { gateway } });
      expect(warnings).toHaveLength(ZERO);
      expect(llmField(config, "gateway")).toBe(gateway);
    }
  });
});

/** Reads a per-id override from the top-level gateways map without type assertion. */
function gatewayOverride(config: Record<string, unknown>, id: string): unknown {
  const gateways = config.gateways;
  if (typeof gateways !== "object" || gateways === null || Array.isArray(gateways)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(gateways, id)?.value;
}

describe("validateConfig — gateways", () => {
  it("keeps a valid top-level gateways block with per-id apiKeyEnv overrides", () => {
    const { config, warnings } = validateConfig({
      gateways: { vercel: { apiKeyEnv: "VERCEL_KEY" } },
    });
    expect(warnings).toHaveLength(ZERO);
    expect(gatewayOverride(config, "vercel")).toEqual({ apiKeyEnv: "VERCEL_KEY" });
  });

  it("strips a non-object gateways value and warns", () => {
    const { config, warnings } = validateConfig({ gateways: "oops" });
    expect(warnings[ZERO]).toContain("gateways must be an object");
    expect(config.gateways).toBeUndefined();
  });

  it("skips individual entries that aren't objects and warns", () => {
    const { config, warnings } = validateConfig({ gateways: { vercel: "oops" } });
    expect(warnings[ZERO]).toContain("gateways.vercel must be an object");
    expect(gatewayOverride(config, "vercel")).toBeUndefined();
  });

  it("strips non-string apiKeyEnv on one entry while keeping valid siblings", () => {
    const { config, warnings } = validateConfig({
      gateways: {
        vercel: { apiKeyEnv: NON_OBJECT_VALUE },
        openrouter: { apiKeyEnv: "OR_KEY" },
      },
    });
    expect(warnings[ZERO]).toContain("gateways.vercel.apiKeyEnv must be a string");
    expect(gatewayOverride(config, "vercel")).toEqual({});
    expect(gatewayOverride(config, "openrouter")).toEqual({ apiKeyEnv: "OR_KEY" });
  });
});
