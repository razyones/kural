import { describe, expect, it } from "vite-plus/test";
import { formatCell } from "./table.ts";

const SCORE = 0.85;
const DELTA = 0.05;
const NEG_DELTA = -0.05;
const ZERO_DELTA = 0;

describe("formatCell", () => {
  it("returns dim dash for null values", () => {
    const result = formatCell(null);
    expect(result).toContain("\u2014");
  });

  it("formats a score value in cyan", () => {
    const result = formatCell(SCORE);
    expect(result).toContain("0.85");
  });

  it("includes delta when non-zero", () => {
    const result = formatCell(SCORE, DELTA);
    expect(result).toContain("0.85");
    expect(result).toContain("+");
  });

  it("includes negative delta", () => {
    const result = formatCell(SCORE, NEG_DELTA);
    expect(result).toContain("0.85");
    expect(result).toContain("-");
  });

  it("omits delta indicator when delta is zero", () => {
    const result = formatCell(SCORE, ZERO_DELTA);
    expect(result).toContain("0.85");
    expect(result).not.toContain("\u25B4");
    expect(result).not.toContain("\u25BE");
  });

  it("omits delta indicator when delta is undefined", () => {
    const result = formatCell(SCORE);
    expect(result).not.toContain("\u25B4");
    expect(result).not.toContain("\u25BE");
  });
});
