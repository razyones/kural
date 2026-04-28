import { GATEWAYS, findGateway } from "./registry.ts";
import { describe, expect, it } from "vite-plus/test";

describe("findGateway", () => {
  it("returns the adapter whose id matches the gateway", () => {
    expect(findGateway("vercel")?.id).toBe("vercel");
    expect(findGateway("openrouter")?.id).toBe("openrouter");
    expect(findGateway("ollama")?.id).toBe("ollama");
  });

  it("returns undefined for an unregistered gateway", () => {
    expect(findGateway("openai")).toBeUndefined();
    expect(findGateway("bogus")).toBeUndefined();
  });

  it("indexes every exported adapter under its own id", () => {
    for (const [id, adapter] of Object.entries(GATEWAYS)) {
      expect(adapter.id).toBe(id);
    }
  });
});
