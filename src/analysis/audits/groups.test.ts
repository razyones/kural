import type { FunctionNode, TypeNode } from "../tree/tree.ts";
import { deduplicateByGroup, groupId } from "./groups.ts";
import { describe, expect, test } from "vite-plus/test";
import { makeFunction, makeType } from "../../../tests/helpers/audits.ts";
import type { ChildWithKey } from "./children.ts";

const NONE = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;

function cwk(node: FunctionNode | TypeNode): ChildWithKey {
  return { key: node.key, node };
}

describe("groupId — patterns priority", () => {
  test("returns patterns when present", () => {
    const node = makeFunction({ patterns: ["handler-group"] });

    expect(groupId(node)).toBe("handler-group");
  });

  test("returns patterns even when companion is also set", () => {
    const node = makeFunction({
      patterns: ["handler-group"],
      companion: "companion-group",
    });

    expect(groupId(node)).toBe("handler-group");
  });
});

describe("groupId — companion fallback", () => {
  test("returns companion when patterns is null", () => {
    const node = makeFunction({
      patterns: null,
      companion: "companion-group",
    });

    expect(groupId(node)).toBe("companion-group");
  });

  test("returns null when both are null", () => {
    const node = makeFunction({
      patterns: null,
      companion: null,
    });

    expect(groupId(node)).toBeNull();
  });
});

describe("groupId — type nodes", () => {
  test("returns null for type node without patterns or companion", () => {
    const node = makeType({
      patterns: null,
      companion: null,
    });

    expect(groupId(node)).toBeNull();
  });

  test("returns patterns for type node with patterns", () => {
    const node = makeType({ patterns: ["schema-group"] });

    expect(groupId(node)).toBe("schema-group");
  });
});

describe("deduplicateByGroup — helper filtering", () => {
  test("skips nodes marked as helper", () => {
    const helper = makeFunction({
      name: "validate",
      key: "func:/src/app.ts:validate",
      helper: true,
    });
    const normal = makeFunction({
      name: "process",
      key: "func:/src/app.ts:process",
      helper: false,
    });
    const items = [cwk(helper), cwk(normal)];

    const { reps } = deduplicateByGroup(items);

    expect(reps.length).toBe(ONE);
    expect(reps[NONE].node.name).toBe("process");
  });
});

describe("deduplicateByGroup — pattern dedup", () => {
  test("keeps one representative per pattern group", () => {
    const a = makeFunction({
      name: "handleA",
      key: "func:/src/app.ts:handleA",
      patterns: ["handlers"],
    });
    const b = makeFunction({
      name: "handleB",
      key: "func:/src/app.ts:handleB",
      patterns: ["handlers"],
    });
    const c = makeFunction({
      name: "handleC",
      key: "func:/src/app.ts:handleC",
      patterns: ["handlers"],
    });
    const items = [cwk(a), cwk(b), cwk(c)];

    const { reps, groups } = deduplicateByGroup(items);

    expect(reps.length).toBe(ONE);
    expect(reps[NONE].node.name).toBe("handleA");
    expect(groups.length).toBe(ONE);
    expect(groups[NONE][NONE]).toBe("handlers");
    expect(groups[NONE][ONE]).toBe(THREE);
  });
});

describe("deduplicateByGroup — companion dedup", () => {
  test("keeps one representative per companion group", () => {
    const a = makeFunction({
      name: "read",
      key: "func:/src/app.ts:read",
      companion: "io-pair",
    });
    const b = makeFunction({
      name: "write",
      key: "func:/src/app.ts:write",
      companion: "io-pair",
    });

    const { reps, groups } = deduplicateByGroup([cwk(a), cwk(b)]);

    expect(reps.length).toBe(ONE);
    expect(groups.length).toBe(ONE);
    expect(groups[NONE][ONE]).toBe(TWO);
  });
});

describe("deduplicateByGroup — ungrouped passthrough", () => {
  test("passes through ungrouped non-helper nodes unchanged", () => {
    const a = makeFunction({
      name: "alpha",
      key: "func:/src/app.ts:alpha",
    });
    const b = makeFunction({
      name: "beta",
      key: "func:/src/app.ts:beta",
    });
    const items = [cwk(a), cwk(b)];

    const { reps, groups } = deduplicateByGroup(items);

    expect(reps.length).toBe(TWO);
    expect(groups.length).toBe(NONE);
  });
});

describe("deduplicateByGroup — mixed groups", () => {
  test("handles mix of grouped, ungrouped, and helper nodes", () => {
    const helper = makeFunction({
      name: "h",
      key: "func:/src/app.ts:h",
      helper: true,
    });
    const patA = makeFunction({
      name: "pA",
      key: "func:/src/app.ts:pA",
      patterns: ["grp"],
    });
    const patB = makeFunction({
      name: "pB",
      key: "func:/src/app.ts:pB",
      patterns: ["grp"],
    });
    const solo = makeFunction({
      name: "solo",
      key: "func:/src/app.ts:solo",
    });

    const items = [cwk(helper), cwk(patA), cwk(patB), cwk(solo)];
    const { reps, groups } = deduplicateByGroup(items);

    expect(reps.length).toBe(TWO);
    expect(reps[NONE].node.name).toBe("pA");
    expect(reps[ONE].node.name).toBe("solo");
    expect(groups.length).toBe(ONE);
  });
});

describe("deduplicateByGroup — empty input", () => {
  test("returns empty arrays for empty input", () => {
    const { reps, groups } = deduplicateByGroup([]);

    expect(reps.length).toBe(NONE);
    expect(groups.length).toBe(NONE);
  });
});
