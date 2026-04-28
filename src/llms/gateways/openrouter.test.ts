import { adaptPrice, adaptThroughput, openrouter } from "./openrouter.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ModelNotFoundError } from "./http.ts";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MINIMAX_INPUT = 0.3;
const MINIMAX_OUTPUT = 1.2;
const MINIMAX_CACHE_READ = 0.06;
const EXPECTED_TTFT = 0.85;
const EXPECTED_TPS = 72;
const MS_TTFT = 850;
const API_KEY = "test-key";
const HTTP_OK = 200;
const NONE = 0;
const ONE_CALL = 1;
const SECOND_CALL = 1;

function jsonResponse(body: unknown, status: number = HTTP_OK): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("adaptPrice", () => {
  it("maps prompt/completion to input/output and converts units", () => {
    const price = adaptPrice({
      prompt: "0.0000003",
      completion: "0.0000012",
      input_cache_read: "0.00000006",
    });
    expect(price.input).toBeCloseTo(MINIMAX_INPUT);
    expect(price.output).toBeCloseTo(MINIMAX_OUTPUT);
    expect(price.cacheRead).toBeCloseTo(MINIMAX_CACHE_READ);
    expect(price.cacheWrite).toBe(NONE);
  });
});

describe("adaptThroughput", () => {
  it("reads latency_last_30m.p50 (ms) and throughput_last_30m.p50 into canonical units", () => {
    const throughput = adaptThroughput({
      latency_last_30m: { p50: MS_TTFT },
      throughput_last_30m: { p50: EXPECTED_TPS },
    });
    expect(throughput?.ttftSeconds).toBeCloseTo(EXPECTED_TTFT);
    expect(throughput?.tokensPerSecond).toBeCloseTo(EXPECTED_TPS);
  });
});

describe("openrouter.fetchCatalog", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("reads prompt/completion pricing and skips throughput when no api key is provided", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "minimax/minimax-m2.7",
            pricing: { prompt: "0.0000003", completion: "0.0000012" },
          },
        ],
      }),
    );
    const entry = await openrouter.fetchCatalog({
      gateway: "openrouter",
      baseURL: OPENROUTER_BASE,
      modelId: "minimax/minimax-m2.7",
    });
    expect(entry?.price.input).toBeCloseTo(MINIMAX_INPUT);
    expect(entry?.throughput).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(ONE_CALL);
  });

  it("sends the bearer token on the endpoints call when an api key is provided", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { prompt: "0.0000003", completion: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            endpoints: [
              {
                latency_last_30m: { p50: MS_TTFT },
                throughput_last_30m: { p50: EXPECTED_TPS },
              },
            ],
          },
        }),
      );
    const entry = await openrouter.fetchCatalog(
      { gateway: "openrouter", baseURL: OPENROUTER_BASE, modelId: "minimax/minimax-m2.7" },
      API_KEY,
    );
    expect(entry?.throughput?.ttftSeconds).toBeCloseTo(EXPECTED_TTFT);
    const [, endpointsInit] = fetchMock.mock.calls[SECOND_CALL] ?? [];
    expect(endpointsInit?.headers).toMatchObject({ Authorization: `Bearer ${API_KEY}` });
  });

  it("throws ModelNotFoundError when the model id is not present", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "other/model", pricing: {} }] }));
    await expect(
      openrouter.fetchCatalog({
        gateway: "openrouter",
        baseURL: OPENROUTER_BASE,
        modelId: "minimax/missing",
      }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  it("returns price without throughput when the endpoints body is an unexpected shape", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { prompt: "0.0000003", completion: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { endpoints: [] } }));
    const entry = await openrouter.fetchCatalog(
      { gateway: "openrouter", baseURL: OPENROUTER_BASE, modelId: "minimax/minimax-m2.7" },
      API_KEY,
    );
    expect(entry?.price.input).toBeCloseTo(MINIMAX_INPUT);
    expect(entry?.throughput).toBeUndefined();
  });

  it("returns price without throughput when the endpoints entry lacks latency/throughput fields", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { prompt: "0.0000003", completion: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { endpoints: [{ unrelated: true }] } }));
    const entry = await openrouter.fetchCatalog(
      { gateway: "openrouter", baseURL: OPENROUTER_BASE, modelId: "minimax/minimax-m2.7" },
      API_KEY,
    );
    expect(entry?.throughput).toBeUndefined();
  });
});

describe("adaptThroughput edge cases", () => {
  it("returns undefined when latency or throughput fields are non-numeric", () => {
    expect(
      adaptThroughput({
        latency_last_30m: { p50: "nope" },
        throughput_last_30m: { p50: EXPECTED_TPS },
      }),
    ).toBeUndefined();
  });
});

describe("openrouter.fetchCatalog malformed bodies", () => {
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
      openrouter.fetchCatalog({
        gateway: "openrouter",
        baseURL: OPENROUTER_BASE,
        modelId: "any",
      }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  it("treats a /models body without a data array as missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ foo: "bar" }));
    await expect(
      openrouter.fetchCatalog({
        gateway: "openrouter",
        baseURL: OPENROUTER_BASE,
        modelId: "any",
      }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  it("returns price without throughput when the endpoints body is not a record", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { prompt: "0.0000003", completion: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse("not a record"));
    const entry = await openrouter.fetchCatalog(
      { gateway: "openrouter", baseURL: OPENROUTER_BASE, modelId: "minimax/minimax-m2.7" },
      API_KEY,
    );
    expect(entry?.throughput).toBeUndefined();
  });

  it("returns price without throughput when endpoints.data is not a record", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "minimax/minimax-m2.7",
              pricing: { prompt: "0.0000003", completion: "0.0000012" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: "not a record" }));
    const entry = await openrouter.fetchCatalog(
      { gateway: "openrouter", baseURL: OPENROUTER_BASE, modelId: "minimax/minimax-m2.7" },
      API_KEY,
    );
    expect(entry?.throughput).toBeUndefined();
  });
});
