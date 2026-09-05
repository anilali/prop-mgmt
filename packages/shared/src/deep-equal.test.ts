import { describe, expect, it } from "vitest";

import { deepEqual } from "./deep-equal";

describe("deepEqual", () => {
  it("treats null and null as equal", () => {
    expect(deepEqual(null, null)).toBe(true);
  });

  it("treats null and undefined as equal (both serialize to absence)", () => {
    expect(deepEqual(null, undefined)).toBe(true);
  });

  it("treats two empty objects as equal", () => {
    expect(deepEqual({}, {})).toBe(true);
  });

  it("treats objects with same fields in different key order as equal", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("treats objects with different values as different", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("treats objects with same nested objects in different key order as equal", () => {
    expect(deepEqual({ x: { a: 1, b: 2 } }, { x: { b: 2, a: 1 } })).toBe(true);
  });

  it("treats arrays with the same items in the same order as equal", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("treats arrays with different ordering as different (arrays are ordered)", () => {
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });

  it("ignores undefined values when comparing objects", () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("compares strings, numbers, and booleans by value", () => {
    expect(deepEqual("foo", "foo")).toBe(true);
    expect(deepEqual(42, 42)).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual("foo", "bar")).toBe(false);
    expect(deepEqual(42, 43)).toBe(false);
  });

  it("treats null and {} as different", () => {
    expect(deepEqual(null, {})).toBe(false);
  });
});
