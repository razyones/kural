import type { CodeNode, NodeMap } from "../sost/tree.ts";
import { describe, expect, test } from "vite-plus/test";
import type { AuditsConfig } from "../config/audits.ts";
import { detect } from "./detect.ts";

const NONE = 0;
const DEFAULT_SENSITIVITY = 2.0;
const DEFAULT_CONTAINMENT_FLOOR = 0.9;
const DEFAULT_MIN_GROUP = 4;
const DEFAULT_CONFIG: AuditsConfig = {
  sensitivity: DEFAULT_SENSITIVITY,
  containmentFloor: DEFAULT_CONTAINMENT_FLOOR,
  minGroup: DEFAULT_MIN_GROUP,
};

function makeDir(key: string, name: string, childKeys: string[]): [string, CodeNode] {
  return [
    key,
    {
      key,
      kind: "directory" as const,
      name,
      identity: [],
      leaf: [],
      childKeys,
      parentKey: null,
      patterns: null,
      companion: null,
      util: false,
      helper: false,
      residuals: [],
      hash: "abcd1234",
      exported: false,
      description: undefined,
    },
  ];
}

function findResult(
  report: ReturnType<typeof detect>,
  name: string,
): ReturnType<typeof detect>[number] | undefined {
  return report.find((r) => r.definition.name === name);
}

describe("detect", () => {
  test("returns empty report for empty tree", () => {
    const nodes: NodeMap = new Map();
    const report = detect(nodes, DEFAULT_CONFIG);
    expect(report.length).toBe(NONE);
  });

  test("returns incomplete-docs for directory missing description", () => {
    const nodes: NodeMap = new Map([makeDir("dir:/src", "src", [])]);
    const report = detect(nodes, DEFAULT_CONFIG);
    const incompleteDocs = findResult(report, "incomplete-docs");
    expect(incompleteDocs).toBeDefined();
    expect(incompleteDocs?.findings.length).toBeGreaterThan(NONE);
  });

  test("respects disabled audits", () => {
    const nodes: NodeMap = new Map([makeDir("dir:/src", "src", [])]);
    const disabled = new Set(["incomplete-docs"]);
    const report = detect(nodes, DEFAULT_CONFIG, null, disabled);
    expect(findResult(report, "incomplete-docs")).toBeUndefined();
  });

  test("directory with description does not trigger incomplete-docs", () => {
    const [key, dir] = makeDir("dir:/src", "src", []);
    dir.description = "Source code directory";
    const nodes: NodeMap = new Map([[key, dir]]);
    const report = detect(nodes, DEFAULT_CONFIG);
    expect(findResult(report, "incomplete-docs")).toBeUndefined();
  });
});
