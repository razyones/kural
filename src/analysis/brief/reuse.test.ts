import { describe, expect, test } from "vite-plus/test";
import { makeFunction, toNodeMap } from "../../../tests/helpers/audits.ts";
import { rankReuse } from "./reuse.ts";

const NONE = 0;
const NEXT = 1;
const CAP = 3;
const E0 = 0.0;
const E09 = 0.9;
const E1 = 1.0;

describe("rankReuse", () => {
  test("ranks only util leaves by cosine", () => {
    const util1 = makeFunction({
      key: "func:/util/a.ts:pick",
      name: "pick",
      identity: [E09, E0],
      util: true,
    });
    const util2 = makeFunction({
      key: "func:/util/a.ts:omit",
      name: "omit",
      identity: [E0, E1],
      util: true,
    });
    const domain = makeFunction({
      key: "func:/domain/x.ts:score",
      name: "score",
      identity: [E1, E0],
      util: false,
    });
    const nodes = toNodeMap(util1, util2, domain);
    const result = rankReuse([E1, E0], nodes, CAP);

    expect(result.length).toBe(NEXT + NEXT);
    expect(result[NONE].name).toBe("pick");
  });

  test("respects cap", () => {
    const fns = [E09, E1, E0].map((e, i) =>
      makeFunction({
        key: `func:/u/f${String(i)}`,
        name: `f${String(i)}`,
        identity: [e],
        util: true,
      }),
    );
    const nodes = toNodeMap(...fns);
    expect(rankReuse([E1], nodes, NEXT).length).toBe(NEXT);
  });
});
