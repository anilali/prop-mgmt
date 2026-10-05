import { describe, expect, it } from "vitest";

import { checkAllocationLines } from "./allocations";

describe("checkAllocationLines", () => {
  it("accepts a split across two accounts and a category", () => {
    expect(() =>
      checkAllocationLines(500_000, [
        { accountId: "a", categoryId: null, amountCents: 300_000 },
        { accountId: "b", categoryId: null, amountCents: 210_000 },
        { accountId: null, categoryId: "c", amountCents: -10_000 },
      ]),
    ).not.toThrow();
  });

  it("rejects lines that do not add up", () => {
    expect(() =>
      checkAllocationLines(-10_000, [
        { accountId: null, categoryId: "c", amountCents: -9_999 },
      ]),
    ).toThrow("The lines add up to -$99.99, not the transaction's -$100.00");
  });

  it("rejects a line with both or neither target, a zero line, and no lines", () => {
    expect(() =>
      checkAllocationLines(1, [
        { accountId: "a", categoryId: "c", amountCents: 1 },
      ]),
    ).toThrow("an account or a category");
    expect(() =>
      checkAllocationLines(1, [
        { accountId: null, categoryId: null, amountCents: 1 },
      ]),
    ).toThrow("an account or a category");
    expect(() =>
      checkAllocationLines(1, [
        { accountId: "a", categoryId: null, amountCents: 1 },
        { accountId: "b", categoryId: null, amountCents: 0 },
      ]),
    ).toThrow("other than 0");
    expect(() => checkAllocationLines(1, [])).toThrow("at least one line");
  });
});
