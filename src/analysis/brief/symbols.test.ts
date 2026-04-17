import { describe, expect, test } from "vite-plus/test";
import { makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";
import { rankSymbols } from "./symbols.ts";

const NONE = 0;
const NEXT = 1;
const CAP = 3;
const E0 = 0.0;
const E09 = 0.9;
const E1 = 1.0;

describe("rankSymbols", () => {
  test("excludes util leaves and ranks the rest", () => {
    const util = makeFunction({
      key: "func:/util/a.ts:pick",
      name: "pick",
      identity: [E1, E0],
      util: true,
    });
    const domain1 = makeFunction({
      key: "func:/domain/x.ts:score",
      name: "score",
      identity: [E09, E0],
      parentKey: "file:/domain/x.ts",
    });
    const domain2 = makeFunction({
      key: "func:/domain/y.ts:merge",
      name: "merge",
      identity: [E0, E1],
      parentKey: "file:/domain/y.ts",
    });
    const nodes = toNodeMap(util, domain1, domain2);
    const result = rankSymbols([E1, E0], nodes, "dir:/other", CAP);

    expect(result.find((s) => s.name === "pick")).toBeUndefined();
    expect(result[NONE].name).toBe("score");
  });

  test("excludes leaves directly under placement target", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:inside",
      name: "inside",
      identity: [E1, E0],
      parentKey: "dir:/src/target",
    });
    const nodes = toNodeMap(fn);
    expect(rankSymbols([E1, E0], nodes, "dir:/src/target", CAP).length).toBe(NONE);
  });

  test("includes signature and facets", () => {
    const fn = makeFunction({
      key: "func:/src/a.ts:foo",
      name: "foo",
      identity: [E1, E0],
      paramNames: ["x"],
      paramTypes: ["number"],
      returnsType: "boolean",
      parentKey: "file:/src/a.ts",
    });
    const nodes = toNodeMap(fn);
    const [entry] = rankSymbols([E1, E0], nodes, "dir:/other", CAP);

    expect(entry.signature).toBe("(x: number) => boolean");
    expect(entry.kind).toBe("function");
    expect(entry.exported).toBe(true);
  });
});

describe("rankSymbols — empty inputs", () => {
  test("returns empty for empty node map", () => {
    expect(rankSymbols([E1, E0], toNodeMap(), "dir:/x", CAP).length).toBe(NONE);
  });

  test("respects cap parameter", () => {
    const fns = [E09, E1, E0].map((e, i) =>
      makeFunction({
        key: `func:/d/f${String(i)}`,
        name: `f${String(i)}`,
        identity: [e],
        parentKey: `file:/d/f${String(i)}`,
      }),
    );
    const nodes = toNodeMap(...fns);
    expect(rankSymbols([E1], nodes, "dir:/x", NEXT).length).toBe(NEXT);
  });
});
