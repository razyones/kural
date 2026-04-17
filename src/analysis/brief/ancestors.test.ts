import { describe, expect, test } from "vite-plus/test";
import { makeDir, toNodeMap } from "../../../tests/helpers/audits.ts";
import { walkAncestors } from "./ancestors.ts";

const NONE = 0;
const NEXT = 1;
const TWO = 2;
const CAP = 3;

describe("walkAncestors", () => {
  test("walks up from placement to root, excluding terminal root", () => {
    const root = makeDir({ key: "dir:/src", name: "src", parentKey: null });
    const analysis = makeDir({
      key: "dir:/src/analysis",
      name: "analysis",
      parentKey: "dir:/src",
      description: "Owns the pipeline",
    });
    const place = makeDir({
      key: "dir:/src/analysis/place",
      name: "place",
      parentKey: "dir:/src/analysis",
      description: "Routes placement",
    });
    const nodes = toNodeMap(root, analysis, place);

    const result = walkAncestors("dir:/src/analysis/place", nodes, CAP);

    expect(result.length).toBe(NEXT);
    expect(result[NONE].name).toBe("analysis");
    expect(result[NONE].description).toBe("Owns the pipeline");
  });

  test("respects cap", () => {
    const root = makeDir({ key: "dir:/", name: "/", parentKey: null });
    const a = makeDir({ key: "dir:/a", name: "a", parentKey: "dir:/" });
    const b = makeDir({ key: "dir:/a/b", name: "b", parentKey: "dir:/a" });
    const c = makeDir({ key: "dir:/a/b/c", name: "c", parentKey: "dir:/a/b" });
    const nodes = toNodeMap(root, a, b, c);

    expect(walkAncestors("dir:/a/b/c", nodes, NEXT).length).toBe(NEXT);
    expect(walkAncestors("dir:/a/b/c", nodes, TWO).length).toBe(TWO);
  });

  test("returns empty when placement is missing", () => {
    expect(walkAncestors("dir:/missing", toNodeMap(), CAP).length).toBe(NONE);
  });
});
