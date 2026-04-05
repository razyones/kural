import { describe, expect, test } from "vite-plus/test";
import { localProject } from "./lcpn.ts";

const NONE = 0;
const TWO = 2;

const V0 = 0;
const V05 = 0.5;
const V07 = 0.7;
const V08 = 0.8;
const V02 = 0.2;
const V01 = 0.1;
const V1 = 1;
const TOLERANCE = 1e-8;

describe("localProject — insufficient siblings", () => {
  test("returns null for a single child vector", () => {
    const q = [V1, V0, V0];
    const result = localProject(q, [[V05, V05, V0]]);

    expect(result).toBeNull();
  });

  test("returns null for empty children array", () => {
    const result = localProject([V1, V0], []);

    expect(result).toBeNull();
  });
});

describe("localProject — two siblings", () => {
  test("projects query and children into subspace", () => {
    const q = [V08, V02, V01];
    const children = [
      [V1, V0, V0],
      [V0, V1, V0],
    ];
    const result = localProject(q, children);

    expect(result).not.toBeNull();
    expect(result?.projectedQ.length).toBeGreaterThan(NONE);
    expect(result?.projectedChildren.length).toBe(TWO);
  });

  test("projected children have same dimensionality as projected query", () => {
    const q = [V05, V05, V05];
    const children = [
      [V1, V0, V0],
      [V0, V0, V1],
    ];
    const result = localProject(q, children);

    expect(result).not.toBeNull();
    const dim = result?.projectedQ.length;
    for (const pc of result?.projectedChildren ?? []) {
      expect(pc.length).toBe(dim);
    }
  });
});

describe("localProject — identical siblings", () => {
  test("returns null when all siblings are identical", () => {
    const q = [V05, V05];
    const children = [
      [V1, V0],
      [V1, V0],
      [V1, V0],
    ];
    const result = localProject(q, children);

    expect(result).toBeNull();
  });
});

describe("localProject — orthogonal siblings preserve separation", () => {
  test("projected children are distinguishable", () => {
    const q = [V07, V02 + V01, V01];
    const children = [
      [V1, V0, V0],
      [V0, V1, V0],
      [V0, V0, V1],
    ];
    const result = localProject(q, children);

    expect(result).not.toBeNull();
    const projected = result?.projectedChildren ?? [];
    const [p0, p1, p2] = projected;
    const allSame =
      p0.every((v, i) => Math.abs(v - p1[i]) < TOLERANCE) &&
      p0.every((v, i) => Math.abs(v - p2[i]) < TOLERANCE);

    expect(allSame).toBe(false);
  });

  test("returns correct number of components", () => {
    const q = [V05, V05, V05, V05];
    const children = [
      [V1, V0, V0, V0],
      [V0, V1, V0, V0],
      [V0, V0, V1, V0],
    ];
    const result = localProject(q, children);

    expect(result).not.toBeNull();
    expect(result?.projectedQ.length).toBeLessThanOrEqual(children.length);
    expect(result?.projectedQ.length).toBeGreaterThan(NONE);
  });
});
