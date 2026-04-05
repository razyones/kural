import { buildResult, buildUncertainSuggestion } from "./result.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeDir, toNodeMap } from "../../../tests/helpers/audits.ts";

const NONE = 0;
const NEXT = 1;
const E0 = 0.0;
const E05 = 0.5;
const E07 = 0.7;
const E08 = 0.8;
const E1 = 1.0;
const PERCENT = 100;

describe("buildUncertainSuggestion", () => {
  test("returns ask-user with safety-gate method", () => {
    const dir = makeDir({
      key: "dir:/src/auth",
      name: "auth",
      description: "Auth module",
      identity: [E1, E0],
    });
    const nodes = toNodeMap(dir);
    const paths = [
      { parentKey: "dir:/src/auth", parentName: "auth", confidence: E05, depth: NEXT, trail: [] },
    ];
    const result = buildUncertainSuggestion(paths, nodes, E05);

    expect(result.action).toBe("ask-user");
    if (result.action === "ask-user") {
      expect(result.method).toBe("safety-gate");
      expect(result.neighborhoods).toBeDefined();
      expect(result.neighborhoods?.length).toBeGreaterThan(NONE);
      expect(result.neighborhoods?.[NONE].name).toBe("auth");
    }
  });

  test("includes confidence percentage in reason", () => {
    const nodes = toNodeMap();
    const result = buildUncertainSuggestion([], nodes, E05);

    if (result.action === "ask-user") {
      expect(result.reason).toContain("50");
    }
  });
});

describe("buildResult — full assembly", () => {
  test("assembles all fields with correct formatting", () => {
    const suggestion = {
      action: "add-to-directory" as const,
      target: "dir:/src/auth",
      name: "auth",
      method: "chain-search",
    };
    const topPath = {
      parentKey: "dir:/src/auth",
      parentName: "auth",
      confidence: E08,
      depth: NEXT,
      trail: [{ node: "src", choice: "auth", probability: E08 * PERCENT }],
    };
    const result = buildResult(
      "login handler",
      { classification: "domain" as const, domainFit: E08, capabilityFit: E05 },
      { alienFence: E07, probeCount: 5 },
      { similarity: E08, name: "authenticate" },
      E05,
      { globalAlien: false, levelAlien: false },
      topPath,
      [topPath],
      suggestion,
      null,
      [],
    );

    expect(result.query).toBe("login handler");
    expect(result.axis.classification).toBe("domain");
    expect(result.detection.globalAlien).toBe(false);
    expect(result.detection.levelAlien).toBeNull();
    expect(result.suggestion.action).toBe("add-to-directory");
    expect(result.confidence).toBeGreaterThan(NONE);
    expect(result.bridge).toBeNull();
    expect(result.relatedConcepts).toEqual([]);
  });

  test("formats bridge info when present", () => {
    const suggestion = {
      action: "add-to-directory" as const,
      target: "dir:/src/cmd",
      name: "cmd",
      method: "bridge-type-routing",
    };
    const topPath = {
      parentKey: "dir:/src/cmd",
      parentName: "cmd",
      confidence: E05,
      depth: NEXT,
      trail: [],
    };
    const bridgeInfo = {
      type: "orchestrator",
      layer: "command",
      confidence: E08,
      gap: E05,
      confident: true,
      alternatives: [{ type: "orchestrator", similarity: E08 }],
    };
    const result = buildResult(
      "pipeline runner",
      { classification: "domain" as const, domainFit: E05, capabilityFit: E05 },
      { alienFence: E07, probeCount: 3 },
      { similarity: E05, name: "run" },
      E05,
      { globalAlien: false, levelAlien: false },
      topPath,
      [topPath],
      suggestion,
      bridgeInfo,
      [],
    );

    expect(result.bridge).not.toBeNull();
    expect(result.bridge?.type).toBe("orchestrator");
    expect(result.bridge?.layer).toBe("command");
    expect(result.bridge?.confident).toBe(true);
  });
});
