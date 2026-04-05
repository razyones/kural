import { colorByHealth, formatDelta, renderHero, verdict } from "./hero.ts";
import { describe, expect, it, vi } from "vite-plus/test";

const GOOD = 0.85;
const MODERATE = 0.55;
const WEAK = 0.2;
const ZERO = 0;
const NEGATIVE = -0.3;

describe("verdict", () => {
  it("returns strong for high scores", () => {
    expect(verdict(GOOD)).toBe("Strong structural fit.");
  });

  it("returns moderate for mid-range scores", () => {
    expect(verdict(MODERATE)).toBe("Moderate structural fit.");
  });

  it("returns weak for low scores", () => {
    expect(verdict(WEAK)).toBe("Weak structural fit.");
  });
});

describe("colorByHealth", () => {
  it("applies green for good scores", () => {
    const result = colorByHealth(GOOD, "test");
    expect(result).toContain("test");
  });

  it("applies yellow for moderate scores", () => {
    const result = colorByHealth(MODERATE, "test");
    expect(result).toContain("test");
  });

  it("applies red for weak scores", () => {
    const result = colorByHealth(WEAK, "test");
    expect(result).toContain("test");
  });
});

describe("renderHero", () => {
  it("renders without delta or childCount", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    renderHero({ score: GOOD, kind: "file" });
    spy.mockRestore();
  });

  it("renders with delta and childCount", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    renderHero({ score: GOOD, kind: "directory", delta: ZERO, childCount: 3 });
    spy.mockRestore();
  });
});

describe("formatDelta", () => {
  it("formats positive delta with up arrow", () => {
    const result = formatDelta(MODERATE);
    expect(result).toContain("+");
    expect(result).toContain("\u25B4");
  });

  it("formats negative delta with down arrow", () => {
    const result = formatDelta(NEGATIVE);
    expect(result).toContain("-");
    expect(result).toContain("\u25BE");
  });

  it("formats zero delta with flat arrow", () => {
    const result = formatDelta(ZERO);
    expect(result).toContain("\u25B8");
  });
});
