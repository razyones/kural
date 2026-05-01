import { GATEWAYS, findGateway, listGateways } from "./registry.ts";
import { describe, expect, it } from "vite-plus/test";

describe("findGateway", () => {
  it("returns the adapter whose id matches the gateway", () => {
    expect(findGateway("vercel")?.id).toBe("vercel");
    expect(findGateway("openrouter")?.id).toBe("openrouter");
    expect(findGateway("ollama")?.id).toBe("ollama");
  });

  it("returns undefined for openai — it is a provider, not a gateway", () => {
    expect(findGateway("openai")).toBeUndefined();
  });

  it("returns undefined for an unregistered gateway", () => {
    expect(findGateway("anthropic")).toBeUndefined();
    expect(findGateway("bogus")).toBeUndefined();
  });

  it("indexes every exported adapter under its own id", () => {
    for (const [id, adapter] of Object.entries(GATEWAYS)) {
      expect(adapter.id).toBe(id);
    }
  });
});

describe("listGateways", () => {
  it("returns every registered gateway id", () => {
    const ids = listGateways();
    expect(ids).toContain("vercel");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("ollama");
  });

  it("does not include openai", () => {
    expect(listGateways()).not.toContain("openai");
  });

  it("returns a frozen array", () => {
    expect(Object.isFrozen(listGateways())).toBe(true);
  });
});
