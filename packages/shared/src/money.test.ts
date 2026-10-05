import { describe, expect, it } from "vitest";

import { formatCents, parseCents, prorate, roundDiv } from "./money";

describe("roundDiv", () => {
  it("rounds halves away from zero", () => {
    expect(roundDiv(1n, 2n)).toBe(1n);
    expect(roundDiv(-1n, 2n)).toBe(-1n);
    expect(roundDiv(3n, 2n)).toBe(2n);
    expect(roundDiv(-3n, 2n)).toBe(-2n);
  });

  it("rounds other fractions to the nearest integer", () => {
    expect(roundDiv(-2n, 3n)).toBe(-1n);
    expect(roundDiv(2n, 3n)).toBe(1n);
    expect(roundDiv(1n, 3n)).toBe(0n);
    expect(roundDiv(-1n, 3n)).toBe(0n);
    expect(roundDiv(6n, 3n)).toBe(2n);
    expect(roundDiv(0n, 7n)).toBe(0n);
  });

  it("throws when the denominator is not above 0", () => {
    expect(() => roundDiv(1n, 0n)).toThrow("denominator must be above 0");
    expect(() => roundDiv(1n, -2n)).toThrow("denominator must be above 0");
  });
});

describe("prorate", () => {
  it("rounds half a cent away from zero", () => {
    expect(prorate(1, [1], [2])).toBe(1);
    expect(prorate(-1, [1], [2])).toBe(-1);
  });

  it("computes an annual share in one step", () => {
    expect(prorate(1_289_119, [2500, 12], [9350, 12])).toBe(344_684);
    expect(prorate(3_354_231, [2500, 12], [9350, 12])).toBe(896_853);
  });

  it("computes a new monthly estimate", () => {
    expect(prorate(1_289_119, [2500], [9350, 12])).toBe(28_724);
  });

  it("handles large values without losing precision", () => {
    expect(prorate(12_345_678_901, [99_999_989], [99_999_991])).toBe(
      12_345_678_654,
    );
  });

  it("throws when a divisor is 0 or negative", () => {
    expect(() => prorate(100, [1], [0])).toThrow("divisor must be above 0");
    expect(() => prorate(100, [1], [-12])).toThrow("divisor must be above 0");
  });

  it("throws when the result is not a safe integer", () => {
    expect(() =>
      prorate(Number.MAX_SAFE_INTEGER, [Number.MAX_SAFE_INTEGER], [1]),
    ).toThrow("prorate result is not a safe integer");
  });

  it("throws on non-integer inputs", () => {
    expect(() => prorate(1.5, [1], [1])).toThrow(
      "amountCents must be a safe integer",
    );
  });
});

describe("parseCents", () => {
  it.each([
    ["1,234.56", 123_456],
    ["$1234.5", 123_450],
    ["-12", -1200],
    ["(12.00)", -1200],
    ["12.00-", -1200],
    ["-$12.34", -1234],
    ["$-12.34", -1234],
    ["  42.1 ", 4210],
    [".5", 50],
    ["0", 0],
    ["-0.00", 0],
    ["1,000,000", 100_000_000],
  ])("parses %s", (text, cents) => {
    expect(parseCents(text)).toBe(cents);
  });

  it.each(["", "abc", "12.345", "1,23", "--12", "(-12)", "12-34", "1 234"])(
    "rejects %s",
    (text) => {
      expect(() => parseCents(text)).toThrow();
    },
  );
});

describe("formatCents", () => {
  it.each([
    [123_456, "$1,234.56"],
    [-36_279, "-$362.79"],
    [0, "$0.00"],
    [5, "$0.05"],
    [100_000_000, "$1,000,000.00"],
  ])("formats %d", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });
});
