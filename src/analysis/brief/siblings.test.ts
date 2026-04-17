import { describe, expect, test } from "vite-plus/test";
import { makeDir, makeFile, toNodeMap } from "../../../tests/helpers/audits.ts";
import { rankSiblings } from "./siblings.ts";

const NONE = 0;
const NEXT = 1;
const CAP = 3;
const E0 = 0.0;
const E09 = 0.9;
const E1 = 1.0;

describe("rankSiblings", () => {
  test("ranks children of placement target by cosine", () => {
    const target = makeDir({
      key: "dir:/src/target",
      childKeys: ["file:/src/target/a.ts", "file:/src/target/b.ts"],
      parentKey: null,
    });
    const close = makeFile({
      key: "file:/src/target/a.ts",
      name: "a.ts",
      identity: [E09, E0, E0],
      leaf: [],
      parentKey: "dir:/src/target",
    });
    const far = makeFile({
      key: "file:/src/target/b.ts",
      name: "b.ts",
      identity: [E0, E1, E0],
      leaf: [],
      parentKey: "dir:/src/target",
    });
    const nodes = toNodeMap(target, close, far);
    const result = rankSiblings([E1, E0, E0], "dir:/src/target", nodes, CAP);

    expect(result.length).toBe(NEXT + NEXT);
    expect(result[NONE].name).toBe("a.ts");
  });

  test("returns empty when target has no children", () => {
    const target = makeDir({ key: "dir:/empty", childKeys: [], parentKey: null });
    const nodes = toNodeMap(target);
    expect(rankSiblings([E1, E0], "dir:/empty", nodes, CAP).length).toBe(NONE);
  });

  test("returns empty when target is absent", () => {
    const nodes = toNodeMap();
    expect(rankSiblings([E1, E0], "dir:/missing", nodes, CAP).length).toBe(NONE);
  });
});
