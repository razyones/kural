import { ModelNotFoundError, parsePerToken } from "./http.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { OpenAIStyleCatalogSpec } from "./catalogFetch.ts";
import type { PricePerMillionTokens } from "./http.ts";
import { fetchOpenAIStyleCatalog } from "./catalogFetch.ts";
import { jsonResponse } from "../../../tests/helpers/http.ts";

const BASE = "https://example.test/v1";
const MODEL_ID = "vendor/model-x";
const API_KEY = "test-key";
const EXPECTED_TTFT = 0.85;
const EXPECTED_TPS = 72;
const MS_TTFT = 850;
const EXPECTED_INPUT = 0.3;
const EXPECTED_OUTPUT = 1.2;
const HTTP_ERROR = 500;
const ONE = 1;
const TWO = 2;

const noSignalExtractor = (): boolean | undefined => undefined;

function adaptPriceFromInput(pricing: Record<string, unknown>): PricePerMillionTokens {
  return {
    input: parsePerToken(pricing["input"]),
    output: parsePerToken(pricing["output"]),
    cacheRead: parsePerToken(pricing["cache_read"]),
    cacheWrite: parsePerToken(pricing["cache_write"]),
  };
}

const BASE_SPEC: OpenAIStyleCatalogSpec = {
  gatewayId: "fake",
  adaptPrice: adaptPriceFromInput,
  latencyKey: "latency",
  throughputKey: "throughput",
  endpointsAuth: "unauthed",
};

const PARAMS = { gateway: "fake", baseURL: BASE, modelId: MODEL_ID };
const VALID_MODEL = {
  id: MODEL_ID,
  pricing: { input: "0.0000003", output: "0.0000012" },
};
const VALID_ENDPOINTS = {
  data: {
    endpoints: [{ latency: { p50: MS_TTFT }, throughput: { p50: EXPECTED_TPS } }],
  },
};

describe("fetchOpenAIStyleCatalog auth strategy unauthed", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("fetches /endpoints with no authorization header even when apiKey is absent", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [VALID_MODEL] }))
      .mockResolvedValueOnce(jsonResponse(VALID_ENDPOINTS));
    const entry = await fetchOpenAIStyleCatalog(BASE_SPEC, PARAMS);
    expect(entry?.throughput?.tokensPerSecond).toBeCloseTo(EXPECTED_TPS);
    expect(fetchMock).toHaveBeenCalledTimes(TWO);
    const [, endpointsInit] = fetchMock.mock.calls[ONE] ?? [];
    expect(endpointsInit).toBeUndefined();
  });
});

describe("fetchOpenAIStyleCatalog auth strategy bearer-or-skip", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const SPEC = { ...BASE_SPEC, endpointsAuth: "bearer-or-skip" as const };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("skips /endpoints entirely when apiKey is absent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [VALID_MODEL] }));
    const entry = await fetchOpenAIStyleCatalog(SPEC, PARAMS);
    expect(entry?.throughput).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(ONE);
  });

  it("sends Bearer auth on /endpoints when apiKey is provided", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [VALID_MODEL] }))
      .mockResolvedValueOnce(jsonResponse(VALID_ENDPOINTS));
    const entry = await fetchOpenAIStyleCatalog(SPEC, PARAMS, API_KEY);
    expect(entry?.throughput?.ttftSeconds).toBeCloseTo(EXPECTED_TTFT);
    const [, endpointsInit] = fetchMock.mock.calls[ONE] ?? [];
    expect(endpointsInit?.headers).toMatchObject({ Authorization: `Bearer ${API_KEY}` });
  });
});

describe("fetchOpenAIStyleCatalog reasoning extractor", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("calls extractReasoning with the model record and propagates the result", async () => {
    const extractReasoning = vi.fn<(record: Record<string, unknown>) => boolean>(() => true);
    const spec: OpenAIStyleCatalogSpec = { ...BASE_SPEC, extractReasoning };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [VALID_MODEL] }))
      .mockResolvedValueOnce(jsonResponse(VALID_ENDPOINTS));
    const entry = await fetchOpenAIStyleCatalog(spec, PARAMS);
    expect(entry?.isReasoning).toBe(true);
    expect(extractReasoning).toHaveBeenCalledWith(VALID_MODEL);
  });

  it("omits isReasoning when the spec has no extractReasoning callback", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [VALID_MODEL] }))
      .mockResolvedValueOnce(jsonResponse(VALID_ENDPOINTS));
    const entry = await fetchOpenAIStyleCatalog(BASE_SPEC, PARAMS);
    expect(entry?.isReasoning).toBeUndefined();
  });

  it("omits isReasoning when extractReasoning returns undefined", async () => {
    const spec: OpenAIStyleCatalogSpec = { ...BASE_SPEC, extractReasoning: noSignalExtractor };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [VALID_MODEL] }))
      .mockResolvedValueOnce(jsonResponse(VALID_ENDPOINTS));
    const entry = await fetchOpenAIStyleCatalog(spec, PARAMS);
    expect(entry?.isReasoning).toBeUndefined();
  });
});

describe("fetchOpenAIStyleCatalog failure modes", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("returns undefined when the /models call fails transiently", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, HTTP_ERROR));
    const entry = await fetchOpenAIStyleCatalog(BASE_SPEC, PARAMS);
    expect(entry).toBeUndefined();
  });

  it("throws ModelNotFoundError when the catalog is reachable but the id is missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "other/model", pricing: {} }] }));
    await expect(fetchOpenAIStyleCatalog(BASE_SPEC, PARAMS)).rejects.toBeInstanceOf(
      ModelNotFoundError,
    );
  });

  it("returns undefined when the model is listed but has no pricing sub-record", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: MODEL_ID }] }));
    const entry = await fetchOpenAIStyleCatalog(BASE_SPEC, PARAMS);
    expect(entry).toBeUndefined();
  });

  it("adapts pricing through the spec's adaptPrice callback", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [VALID_MODEL] }))
      .mockResolvedValueOnce(jsonResponse({}, HTTP_ERROR));
    const entry = await fetchOpenAIStyleCatalog(BASE_SPEC, PARAMS);
    expect(entry?.price.input).toBeCloseTo(EXPECTED_INPUT);
    expect(entry?.price.output).toBeCloseTo(EXPECTED_OUTPUT);
  });
});
