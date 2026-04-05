import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFunction, makeType, toNodeMap } from "../../../tests/helpers/audits.ts";
import { findRelatedConcepts } from "./related.ts";

const NONE = 0;
const NEXT = 1;
const E0 = 0.0;
const E09 = 0.9;
const E1 = 1.0;

describe("findRelatedConcepts — basic search", () => {
  test("returns related leaves sorted by similarity", () => {
    const fn1 = makeFunction({
      key: "func:/src/a.ts:close",
      name: "close",
      identity: [E09, E0, E0],
      parentKey: "file:/src/a.ts",
    });
    const fn2 = makeFunction({
      key: "func:/src/b.ts:far",
      name: "far",
      identity: [E0, E1, E0],
      parentKey: "file:/src/b.ts",
    });
    const dir = makeDir({
      key: "dir:/src/target",
      parentKey: null,
    });
    const nodes = toNodeMap(fn1, fn2, dir);
    const q = [E1, E0, E0];
    const groups = findRelatedConcepts(q, nodes, "dir:/src/target");

    expect(groups.length).toBeGreaterThan(NONE);
    const allItems = groups.flatMap((g) => g.items);
    expect(allItems[NONE].name).toBe("close");
  });

  test("excludes leaves from the placement directory", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:inside",
      name: "inside",
      identity: [E1, E0],
      parentKey: "dir:/src/target",
    });
    const nodes = toNodeMap(fn);
    const groups = findRelatedConcepts([E1, E0], nodes, "dir:/src/target");
    const allItems = groups.flatMap((g) => g.items);

    expect(allItems.find((i) => i.name === "inside")).toBeUndefined();
  });

  test("returns empty for no leaves", () => {
    const dir = makeDir({ identity: [E1, E0] });
    const nodes = toNodeMap(dir);
    const groups = findRelatedConcepts([E1, E0], nodes, "dir:/other");

    expect(groups.length).toBe(NONE);
  });
});

describe("findRelatedConcepts — grouping by file", () => {
  test("groups items by their parent file", () => {
    const fn1 = makeFunction({
      key: "func:/src/a.ts:foo",
      name: "foo",
      identity: [E1, E0],
      parentKey: "file:/src/a.ts",
    });
    const fn2 = makeFunction({
      key: "func:/src/a.ts:bar",
      name: "bar",
      identity: [E09, E0],
      parentKey: "file:/src/a.ts",
    });
    const ty = makeType({
      key: "type:/src/b.ts:Baz",
      name: "Baz",
      identity: [E0, E1],
      parentKey: "file:/src/b.ts",
    });
    const nodes = toNodeMap(fn1, fn2, ty);
    const groups = findRelatedConcepts([E1, E0], nodes, "dir:/other");
    const aGroup = groups.find((g) => g.path === "file:/src/a.ts");

    expect(aGroup).toBeDefined();
    expect(aGroup?.items.length).toBe(NEXT + NEXT);
  });
});
