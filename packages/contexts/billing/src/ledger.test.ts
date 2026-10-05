import { describe, expect, it } from "vitest";

import type { LedgerEntry } from "./types";
import { checkLedgerEntry, entryDateFor, isInFinalizedYear } from "./ledger";

const adjustment: LedgerEntry = {
  id: "e",
  propertyId: "p",
  accountId: "a",
  kind: "adjustment",
  entryDate: "2026-03-01",
  amountCents: -2_500,
  note: "Move balance to unit B",
  feeMonth: null,
  reconciliationYearId: null,
};

describe("checkLedgerEntry", () => {
  it("accepts a credit or charge with a note", () => {
    expect(() => checkLedgerEntry(adjustment)).not.toThrow();
    expect(() =>
      checkLedgerEntry({ ...adjustment, amountCents: 2_500 }),
    ).not.toThrow();
  });

  it("rejects an adjustment of 0 or with no note", () => {
    expect(() => checkLedgerEntry({ ...adjustment, amountCents: 0 })).toThrow(
      "amount other than 0",
    );
    expect(() => checkLedgerEntry({ ...adjustment, note: "  " })).toThrow(
      "needs a note",
    );
  });

  it("checks late fee kinds", () => {
    const fee: LedgerEntry = {
      ...adjustment,
      kind: "late_fee",
      amountCents: 5_000,
      note: null,
      feeMonth: "2026-03",
    };
    expect(() => checkLedgerEntry(fee)).not.toThrow();
    expect(() => checkLedgerEntry({ ...fee, amountCents: 0 })).toThrow();
    expect(() => checkLedgerEntry({ ...fee, feeMonth: null })).toThrow();
    expect(() =>
      checkLedgerEntry({ ...fee, kind: "late_fee_dismissed", amountCents: 0 }),
    ).not.toThrow();
    expect(() =>
      checkLedgerEntry({ ...fee, kind: "late_fee_dismissed" }),
    ).toThrow();
    expect(() =>
      checkLedgerEntry({ ...adjustment, feeMonth: "2026-03" }),
    ).toThrow();
  });

  it("requires a year on a true-up only", () => {
    const trueUp: LedgerEntry = {
      ...adjustment,
      kind: "true_up",
      note: null,
      reconciliationYearId: "y",
    };
    expect(() => checkLedgerEntry(trueUp)).not.toThrow();
    expect(() =>
      checkLedgerEntry({ ...trueUp, reconciliationYearId: null }),
    ).toThrow();
    expect(() =>
      checkLedgerEntry({ ...adjustment, reconciliationYearId: "y" }),
    ).toThrow();
  });
});

describe("entryDateFor", () => {
  it("keeps a date outside any finalized year", () => {
    expect(entryDateFor("2026-03-01", "2027-02-01", [2025])).toEqual({
      entryDate: "2026-03-01",
      movedFrom: null,
    });
  });

  it("moves a date inside a finalized year to today", () => {
    expect(isInFinalizedYear("2026-12-31", [2026])).toBe(true);
    expect(entryDateFor("2026-12-31", "2027-01-12", [2026])).toEqual({
      entryDate: "2027-01-12",
      movedFrom: "2026-12-31",
    });
  });
});
