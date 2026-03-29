import { describe, expect, it } from "vite-plus/test";
import { getCausesText } from "./causes.ts";

describe("getCausesText", () => {
  it("returns causes text for impure function", () => {
    expect(getCausesText({ causes: "reads from disk" })).toBe("reads from disk");
  });

  it("returns empty string when causes is undefined", () => {
    expect(getCausesText({ causes: undefined })).toBe("");
  });

  it("returns empty string when causes field is absent", () => {
    expect(getCausesText({})).toBe("");
  });
});
