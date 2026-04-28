import { adaptPrice, adaptThroughput, vercel } from "./vercel.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ModelNotFoundError } from "./http.ts";

const VERCEL_BASE = "https://ai-gateway.vercel.sh/v1";
const EXPECTED_INPUT = 3;
const EXPECTED_OUTPUT = 15;
const EXPECTED_CACHE_READ = 0.3;
const EXPECTED_CACHE_WRITE = 3.75;
const MINIMAX_INPUT = 0.3;
const MINIMAX_OUTPUT = 1.2;
const EXPECTED_TTFT = 0.85;
const EXPECTED_TPS = 72;
const MS_TTFT = 850;
const HTTP_OK = 200;
const HTTP_ERROR = 500;
const NONE = 0;

function jsonResponse(body: unknown, status: number = HTTP_OK): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("adaptPrice", () => {
  it("converts per-token strings into per-million numbers using Vercel field names", () => {
    const price = adaptPrice({
      input: "0.000003",
      output: "0.000015",
      input_cache_read: "0.0000003",
      input_cache_write: "0.00000375",
    });
    expect(price.input).toBeCloseTo(EXPECTED_INPUT);
    expect(price.output).toBeCloseTo(EXPECTED_OUTPUT);
    expect(price.cacheRead).toBeCloseTo(EXPECTED_CACHE_READ);
    expect(price.cacheWrite).toBeCloseTo(EXPECTED_CACHE_WRITE);
  });

  it("defaults missing cache fields to zero (implicit-cache gateways)", () => {
    const price = adaptPrice({ input: "0.0000003", output: "0.0000012" });
    expect(price.cacheRead).toBe(NONE);
    expect(price.cacheWrite).toBe(NONE);
  });
});

describe("adaptThroughput", () => {
  it("reads latency_last_1h.p50 (ms) and throughput_last_1h.p50 into canonical units", () => {
    const throughput = adaptThroughput({
      latency_last_1h: { p50: MS_TTFT },
      throughput_last_1h: { p50: EXPECTED_TPS },
    });
    expect(throughput?.ttftSeconds).toBeCloseTo(EXPECTED_TTFT);
    expect(throughput?.tokensPerSecond).toBeCloseTo(EXPECTED_TPS);
  });

  it("returns undefined when either field is missing", () => {
    expect(adaptThroughput({ latency_last_1h: { p50: MS_TTFT } })).toBeUndefined();
    expect(adaptThroughput({ throughput_last_1h: { p50: EXPECTED_TPS } })).toBeUndefined();
  });
});

describe("vercel.fetchCatalog", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("reads pricing for a matching model and attaches throughput from the endpoints call", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { input: "0.0000003", output: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            endpoints: [
              {
                latency_last_1h: { p50: MS_TTFT },
                throughput_last_1h: { p50: EXPECTED_TPS },
              },
            ],
          },
        }),
      );
    const entry = await vercel.fetchCatalog({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "minimax/minimax-m2.7",
    });
    expect(entry?.price.input).toBeCloseTo(MINIMAX_INPUT);
    expect(entry?.price.output).toBeCloseTo(MINIMAX_OUTPUT);
    expect(entry?.throughput?.ttftSeconds).toBeCloseTo(EXPECTED_TTFT);
  });

  it("throws ModelNotFoundError when the catalog is reachable but the id is missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "other/model", pricing: {} }] }));
    await expect(
      vercel.fetchCatalog({ gateway: "vercel", baseURL: VERCEL_BASE, modelId: "minimax/missing" }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  it("returns undefined when the /models call returns a non-ok status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, HTTP_ERROR));
    const entry = await vercel.fetchCatalog({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "anything",
    });
    expect(entry).toBeUndefined();
  });

  it("returns undefined when fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new Error("DNS lookup failed"));
    const entry = await vercel.fetchCatalog({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "anything",
    });
    expect(entry).toBeUndefined();
  });

  it("returns price without throughput when only the endpoints call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { input: "0.0000003", output: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, HTTP_ERROR));
    const entry = await vercel.fetchCatalog({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "minimax/minimax-m2.7",
    });
    expect(entry?.price.input).toBeCloseTo(MINIMAX_INPUT);
    expect(entry?.throughput).toBeUndefined();
  });

  it("returns price without throughput when the endpoints payload is the wrong shape", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { input: "0.0000003", output: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { endpoints: [] } }));
    const entry = await vercel.fetchCatalog({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "minimax/minimax-m2.7",
    });
    expect(entry?.throughput).toBeUndefined();
  });
});

describe("vercel.fetchCatalog reasoning flag", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function mockCatalog(record: Record<string, unknown>): void {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [record] }))
      .mockResolvedValueOnce(jsonResponse({}, HTTP_ERROR));
  }

  const FETCH_PARAMS = {
    gateway: "vercel",
    baseURL: VERCEL_BASE,
    modelId: "minimax/minimax-m2.7",
  };
  const BASE_RECORD = {
    id: "minimax/minimax-m2.7",
    pricing: { input: "0.0000003", output: "0.0000012" },
  };

  it("sets isReasoning=true when the tags array contains 'reasoning'", async () => {
    mockCatalog({ ...BASE_RECORD, tags: ["tool-use", "reasoning", "vision"] });
    const entry = await vercel.fetchCatalog(FETCH_PARAMS);
    expect(entry?.isReasoning).toBe(true);
  });

  it("omits isReasoning when the tags array lacks 'reasoning'", async () => {
    mockCatalog({ ...BASE_RECORD, tags: ["tool-use"] });
    const entry = await vercel.fetchCatalog(FETCH_PARAMS);
    expect(entry?.isReasoning).toBeUndefined();
  });

  it("omits isReasoning when tags is absent from the record", async () => {
    mockCatalog(BASE_RECORD);
    const entry = await vercel.fetchCatalog(FETCH_PARAMS);
    expect(entry?.isReasoning).toBeUndefined();
  });
});

describe("adaptThroughput edge cases", () => {
  it("returns undefined when latency/throughput fields are non-numeric", () => {
    expect(
      adaptThroughput({
        latency_last_1h: { p50: "nope" },
        throughput_last_1h: { p50: EXPECTED_TPS },
      }),
    ).toBeUndefined();
  });
});

describe("vercel.fetchCatalog malformed bodies", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("treats a non-record /models body as missing — throws ModelNotFoundError", async () => {
    fetchMock.mockResolvedValue(jsonResponse("not a record"));
    await expect(
      vercel.fetchCatalog({ gateway: "vercel", baseURL: VERCEL_BASE, modelId: "any" }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  it("treats a /models body without a data array as missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ foo: "bar" }));
    await expect(
      vercel.fetchCatalog({ gateway: "vercel", baseURL: VERCEL_BASE, modelId: "any" }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  it("returns price without throughput when the endpoints body is not a record", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { input: "0.0000003", output: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse("not a record"));
    const entry = await vercel.fetchCatalog({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "minimax/minimax-m2.7",
    });
    expect(entry?.throughput).toBeUndefined();
  });

  it("returns price without throughput when endpoints.data is not a record", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { input: "0.0000003", output: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: "not a record" }));
    const entry = await vercel.fetchCatalog({
      gateway: "vercel",
      baseURL: VERCEL_BASE,
      modelId: "minimax/minimax-m2.7",
    });
    expect(entry?.throughput).toBeUndefined();
  });
});
