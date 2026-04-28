import { describe, expect, it, test } from "vite-plus/test";
import { isRecord, num, str } from "./record.ts";

const NONE = 0;
const FORTY_TWO = 42;
const NEG_ONE = -1;
const PI = 3.14;

describe("num — extracts numeric values", () => {
  test("returns number when key exists and value is a number", () => {
    const record = { count: FORTY_TWO };
    expect(num(record, "count")).toBe(FORTY_TWO);
  });

  test("returns zero for integer value", () => {
    const record = { count: NONE };
    expect(num(record, "count")).toBe(NONE);
  });

  test("returns negative numbers", () => {
    const record = { offset: NEG_ONE };
    expect(num(record, "offset")).toBe(NEG_ONE);
  });

  test("returns float values", () => {
    const record = { ratio: PI };
    expect(num(record, "ratio")).toBe(PI);
  });
});

describe("num — fallback to zero", () => {
  test("returns zero when key is missing", () => {
    const record = { other: FORTY_TWO };
    expect(num(record, "missing")).toBe(NONE);
  });

  test("returns zero when value is a string", () => {
    const record: Record<string, unknown> = { count: "42" };
    expect(num(record, "count")).toBe(NONE);
  });

  test("returns zero when value is a boolean", () => {
    const record: Record<string, unknown> = { flag: true };
    expect(num(record, "flag")).toBe(NONE);
  });

  test("returns zero when value is null", () => {
    const record: Record<string, unknown> = { val: null };
    expect(num(record, "val")).toBe(NONE);
  });

  test("returns zero when value is undefined", () => {
    const record: Record<string, unknown> = { val: undefined };
    expect(num(record, "val")).toBe(NONE);
  });

  test("returns zero when record is undefined", () => {
    expect(num(undefined, "key")).toBe(NONE);
  });
});

describe("str — extracts string values", () => {
  test("returns string when key exists and value is a string", () => {
    const record = { name: "hello" };
    expect(str(record, "name")).toBe("hello");
  });

  test("returns empty string value", () => {
    const record = { name: "" };
    expect(str(record, "name")).toBe("");
  });
});

describe("str — fallback to empty string", () => {
  test("returns empty string when key is missing", () => {
    const record = { other: "value" };
    expect(str(record, "missing")).toBe("");
  });

  test("returns empty string when value is a number", () => {
    const record: Record<string, unknown> = { count: FORTY_TWO };
    expect(str(record, "count")).toBe("");
  });

  test("returns empty string when value is a boolean", () => {
    const record: Record<string, unknown> = { flag: false };
    expect(str(record, "flag")).toBe("");
  });

  test("returns empty string when value is null", () => {
    const record: Record<string, unknown> = { val: null };
    expect(str(record, "val")).toBe("");
  });

  test("returns empty string when value is undefined", () => {
    const record: Record<string, unknown> = { val: undefined };
    expect(str(record, "val")).toBe("");
  });

  test("returns empty string when record is undefined", () => {
    expect(str(undefined, "key")).toBe("");
  });
});

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rejects arrays, null, and primitives", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});
