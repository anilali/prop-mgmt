import { describe, expect, it } from "vitest";

import type { AccountLedger, AccountPayment } from "./balance";
import type { MonthCellState } from "./month-cells";
import type { AccountTerms } from "./types";
import { monthCells } from "./month-cells";

const RENT = 300_000;

function account(
  options: { startDate?: string; moveOutDate?: string | null } = {},
): AccountTerms {
  const startDate = options.startDate ?? "2025-06-01";
  return {
    accountId: "a",
    tenantId: "t",
    unitId: "u",
    openingBalanceCents: 0,
    leases: [
      {
        leaseId: "l",
        startDate,
        endDate: "2027-12-31",
        moveOutDate: options.moveOutDate ?? null,
        lateFee: { amountCents: 5_000, day: 10 },
        insuranceExpiresOn: null,
        rentSteps: [
          {
            id: "r",
            startsOn: startDate,
            amountCents: RENT,
            tenantNotifiedAt: null,
          },
        ],
        estimateSteps: [],
        fixedChargeSteps: [],
      },
    ],
  };
}

function pay(postedOn: string, amountCents = RENT): AccountPayment {
  return {
    transactionId: `t-${postedOn}-${amountCents}`,
    postedOn,
    description: "Rent",
    amountCents,
  };
}

function ledger(
  terms: AccountTerms,
  payments: AccountPayment[],
  trackingStart: string | null = "2026-01-01",
): AccountLedger {
  return { account: terms, trackingStart, payments, entries: [] };
}

function states(
  l: AccountLedger,
  today: string,
  newestBankDate: string | null,
  pending: string[] = [],
): MonthCellState[] {
  return monthCells(l, today, newestBankDate, new Set(pending)).map(
    (cell) => cell.state,
  );
}

const firstOf = (months: string[]) => months.map((m) => pay(`2026-${m}-01`));

describe("monthCells", () => {
  it("shows paid, short, unpaid, open, and future months for the current year", () => {
    const l = ledger(account(), [
      ...firstOf(["01", "02", "03", "04", "05", "06", "08"]),
      pay("2026-09-02", 100_000),
    ]);

    const cells = monthCells(l, "2026-10-05", "2026-10-04", new Set());

    expect(cells.map((cell) => cell.state)).toEqual([
      "paid",
      "paid",
      "paid",
      "paid",
      "paid",
      "paid",
      "unpaid",
      "paid",
      "short",
      "open",
      "future",
      "future",
    ]);
    expect(cells.map((cell) => cell.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(cells.every((cell) => cell.expectedCents === RENT)).toBe(true);
    expect(cells[8]).toEqual({
      month: 9,
      state: "short",
      expectedCents: RENT,
      paidCents: 100_000,
    });
  });

  it("keeps this month open until the late-fee day passes and bank data reaches it", () => {
    const l = ledger(
      account(),
      firstOf(["01", "02", "03", "04", "05", "06", "07", "08", "09"]),
    );
    expect(states(l, "2026-10-10", "2026-10-10")[9]).toBe("open");
    expect(states(l, "2026-10-12", "2026-10-08")[9]).toBe("open");
    expect(states(l, "2026-10-12", "2026-10-10")[9]).toBe("unpaid");
  });

  it("shows a part payment this month as short", () => {
    const l = ledger(account(), [pay("2026-10-02", 1_000)]);
    expect(states(l, "2026-10-05", "2026-10-04")[9]).toBe("short");
  });

  it("shows no data for months the bank data does not reach", () => {
    const l = ledger(account(), [
      ...firstOf(["01", "02", "03", "04", "05", "06", "07"]),
      pay("2026-09-03"),
    ]);
    expect(states(l, "2026-10-05", "2026-08-20").slice(6, 10)).toEqual([
      "paid",
      "unpaid",
      "paid",
      "nodata",
    ]);
    expect(states(l, "2026-10-05", null).slice(6, 10)).toEqual([
      "paid",
      "nodata",
      "paid",
      "nodata",
    ]);
  });

  it("shows pending for a month with a deposit waiting to be sorted", () => {
    const l = ledger(account(), [
      ...firstOf(["01", "02", "03", "04", "05", "06", "07", "08"]),
      pay("2026-09-02", 100_000),
    ]);
    expect(
      states(l, "2026-10-05", "2026-10-02", ["2026-09", "2026-10"]).slice(
        7,
        10,
      ),
    ).toEqual(["paid", "pending", "pending"]);
    expect(states(l, "2026-10-05", "2026-09-30", ["2026-10"])[9]).toBe(
      "pending",
    );
  });

  it("counts a payment in the month it posted, not the month it pays for", () => {
    const l = ledger(account(), [
      pay("2026-01-01"),
      pay("2026-01-30"),
      pay("2026-03-01"),
      pay("2026-03-04", -RENT),
    ]);
    const cells = monthCells(l, "2026-03-20", "2026-03-19", new Set());
    expect(cells.slice(0, 3)).toEqual([
      { month: 1, state: "paid", expectedCents: RENT, paidCents: 2 * RENT },
      { month: 2, state: "unpaid", expectedCents: RENT, paidCents: 0 },
      { month: 3, state: "unpaid", expectedCents: RENT, paidCents: 0 },
    ]);
  });

  it("starts a mid-year account in its first month at the full amount", () => {
    const l = ledger(account({ startDate: "2026-03-15" }), [pay("2026-03-15")]);
    const cells = monthCells(l, "2026-04-05", "2026-04-03", new Set());
    expect(cells.slice(0, 4)).toEqual([
      { month: 1, state: "off", expectedCents: 0, paidCents: 0 },
      { month: 2, state: "off", expectedCents: 0, paidCents: 0 },
      { month: 3, state: "paid", expectedCents: RENT, paidCents: RENT },
      { month: 4, state: "open", expectedCents: RENT, paidCents: 0 },
    ]);
  });

  it("is off after a move-out, including later months", () => {
    const l = ledger(
      account({ moveOutDate: "2026-08-10" }),
      firstOf(["01", "02", "03", "04", "05", "06", "07"]),
    );
    expect(states(l, "2026-10-05", "2026-10-04")).toEqual([
      "paid",
      "paid",
      "paid",
      "paid",
      "paid",
      "paid",
      "paid",
      "unpaid",
      "off",
      "off",
      "off",
      "off",
    ]);
  });

  it("is off before the tracking start and when there is none", () => {
    const later = ledger(account(), firstOf(["03", "04"]), "2026-04-01");
    const cells = monthCells(later, "2026-04-05", "2026-04-03", new Set());
    expect(
      cells.slice(0, 4).map((cell) => [cell.state, cell.paidCents]),
    ).toEqual([
      ["off", 0],
      ["off", 0],
      ["off", 0],
      ["paid", RENT],
    ]);
    expect(
      new Set(states(ledger(account(), [], null), "2026-04-05", "2026-04-03")),
    ).toEqual(new Set(["off"]));
  });
});
