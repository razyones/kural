import { ModelNotFoundError, fetchJson, parsePerToken } from "./http.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { jsonResponse } from "../../../tests/helpers/http.ts";

const PER_MILLION_INPUT = 0.0000003;
const EXPECTED_PER_MILLION = 0.3;
const ZERO = 0;
const HTTP_ERROR = 500;

describe("parsePerToken", () => {
  it("multiplies a numeric string into per-million units", () => {
    expect(parsePerToken(String(PER_MILLION_INPUT))).toBeCloseTo(EXPECTED_PER_MILLION);
  });

  it("multiplies a number the same way", () => {
    expect(parsePerToken(PER_MILLION_INPUT)).toBeCloseTo(EXPECTED_PER_MILLION);
  });

  it("treats negative, NaN, and non-numeric values as zero", () => {
    expect(parsePerToken("-1")).toBe(ZERO);
    expect(parsePerToken("not a number")).toBe(ZERO);
    expect(parsePerToken(null)).toBe(ZERO);
    expect(parsePerToken({})).toBe(ZERO);
  });
});

describe("ModelNotFoundError", () => {
  it("names the gateway and model id in its message", () => {
    const err = new ModelNotFoundError("vercel", "missing/model");
    expect(err.message).toContain("missing/model");
    expect(err.message).toContain("vercel");
    expect(err.name).toBe("ModelNotFoundError");
  });
});

describe("fetchJson", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("returns parsed JSON on a 2xx response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const body = await fetchJson("https://example.com/json");
    expect(body).toEqual({ ok: true });
  });

  it("returns undefined on a non-ok status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, HTTP_ERROR));
    expect(await fetchJson("https://example.com/json")).toBeUndefined();
  });

  it("returns undefined when fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new Error("DNS lookup failed"));
    expect(await fetchJson("https://example.com/json")).toBeUndefined();
  });

  it("forwards init options to fetch for auth headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await fetchJson("https://example.com/json", { headers: { Authorization: "Bearer test" } });
    const [, init] = fetchMock.mock.calls[ZERO] ?? [];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test" });
  });
});
