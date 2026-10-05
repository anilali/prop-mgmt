import { describe, expect, it } from "vitest";

import type { AccountLedger, AccountPayment } from "./balance";
import type { AccountTerms, LedgerEntry } from "./types";
import { balanceOn } from "./balance";
import {
  isLateFeeDecided,
  lateFeeEntryDate,
  lateFeeMonths,
  lateFeeSuggestion,
  lateFeeSuggestions,
} from "./late-fee";

const RENT = 330_000;
const CAM = 35_482;
const MONTHLY = RENT + CAM;
const FEE = 5_000;

function account(
  options: {
    startDate?: string;
    openingBalanceCents?: number;
    lateFee?: { amountCents: number; day: number } | null;
  } = {},
): AccountTerms {
  const startDate = options.startDate ?? "2025-06-01";
  return {
    accountId: "a",
    tenantId: "t",
    unitId: "u",
    openingBalanceCents: options.openingBalanceCents ?? 0,
    leases: [
      {
        leaseId: "l",
        startDate,
        endDate: "2027-12-31",
        moveOutDate: null,
        lateFee:
          options.lateFee === undefined
            ? { amountCents: FEE, day: 10 }
            : options.lateFee,
        insuranceExpiresOn: null,
        rentSteps: [
          {
            id: "r",
            startsOn: startDate,
            amountCents: RENT,
            tenantNotifiedAt: null,
          },
        ],
        estimateSteps: [
          { id: "e", poolId: "cam", startsOn: startDate, amountCents: CAM },
        ],
      },
    ],
  };
}

function pay(postedOn: string, amountCents = MONTHLY): AccountPayment {
  return {
    transactionId: `t-${postedOn}-${amountCents}`,
    postedOn,
    description: "ACH DEPOSIT",
    amountCents,
  };
}

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: `e-${overrides.entryDate ?? "x"}-${overrides.kind ?? "adjustment"}`,
    propertyId: "p",
    accountId: "a",
    kind: "adjustment",
    entryDate: "2026-02-10",
    amountCents: 20_000,
    note: "Repair",
    feeMonth: null,
    reconciliationYearId: null,
    ...overrides,
  };
}

function ledger(
  payments: AccountPayment[],
  entries: LedgerEntry[] = [],
  terms: AccountTerms = account(),
): AccountLedger {
  return { account: terms, trackingStart: "2026-01-01", payments, entries };
}

const paidThroughFebruary = [pay("2026-01-01"), pay("2026-02-01")];

describe("lateFeeMonths", () => {
  it("returns only the current month", () => {
    expect(lateFeeMonths("2026-03-15")).toEqual(["2026-03"]);
    expect(lateFeeMonths("2026-04-01")).toEqual(["2026-04"]);
  });

  it("shows nothing for March on April 1", () => {
    const short = ledger([
      ...paidThroughFebruary,
      pay("2026-03-04", 300_000),
      pay("2026-04-01"),
    ]);
    expect(lateFeeSuggestions(short, "2026-03-31")).toHaveLength(1);
    expect(lateFeeSuggestions(short, "2026-04-01")).toEqual([]);
  });
});

describe("lateFeeSuggestion", () => {
  it("suggests the fee for a short payment, as in the 5.5 example", () => {
    const short = ledger([
      ...paidThroughFebruary,
      pay("2026-03-02", 200_000),
      pay("2026-03-09", 100_000),
    ]);

    expect(balanceOn(short, "2026-03-15")).toBe(65_482);
    const suggestion = lateFeeSuggestion(short, "2026-03", "2026-03-15");
    expect(suggestion).toEqual({
      accountId: "a",
      month: "2026-03",
      amountCents: FEE,
      feeDate: "2026-03-10",
    });
    expect(lateFeeSuggestions(short, "2026-03-31")).toEqual([suggestion]);
    if (!suggestion) throw new Error("expected a suggestion");

    const date = lateFeeEntryDate(suggestion, "2026-03-15", []);
    expect(date).toEqual({ entryDate: "2026-03-11", movedFrom: null });
    const approved = ledger(short.payments.slice(), [
      entry({
        kind: "late_fee",
        entryDate: date.entryDate,
        amountCents: FEE,
        note: null,
        feeMonth: "2026-03",
      }),
    ]);
    expect(balanceOn(approved, "2026-03-15")).toBe(70_482);
    expect(lateFeeSuggestion(approved, "2026-03", "2026-03-15")).toBeNull();
  });

  it("suggests nothing for an autopay on the 5th with fee day 10", () => {
    const autopay = ledger([...paidThroughFebruary, pay("2026-03-05")]);
    expect(lateFeeSuggestion(autopay, "2026-03", "2026-03-20")).toBeNull();
  });

  it("waits until the day after the fee day", () => {
    const unpaid = ledger(paidThroughFebruary);
    expect(lateFeeSuggestion(unpaid, "2026-03", "2026-03-09")).toBeNull();
    expect(lateFeeSuggestion(unpaid, "2026-03", "2026-03-10")).toBeNull();
    expect(lateFeeSuggestion(unpaid, "2026-03", "2026-03-11")).toMatchObject({
      amountCents: FEE,
      feeDate: "2026-03-10",
    });
  });

  it("counts a payment made on the fee day", () => {
    const onFeeDay = ledger([...paidThroughFebruary, pay("2026-03-10")]);
    expect(lateFeeSuggestion(onFeeDay, "2026-03", "2026-03-11")).toBeNull();
  });

  it("counts an early payment on the last day of the previous month as carried credit", () => {
    const early = ledger(
      [
        ...["01", "02", "03", "04", "05", "06", "07"].map((month) =>
          pay(`2026-${month}-01`),
        ),
        pay("2026-07-31"),
      ],
      [entry({ entryDate: "2026-08-03", amountCents: 12_500 })],
    );

    expect(balanceOn(early, "2026-07-31")).toBe(-MONTHLY);
    expect(balanceOn(early, "2026-08-15")).toBe(12_500);
    expect(lateFeeSuggestion(early, "2026-08", "2026-08-15")).toBeNull();
  });

  it("counts a prepaid opening balance as carried credit in the first month", () => {
    const prepaid = ledger(
      [],
      [entry({ entryDate: "2026-01-04", amountCents: 9_900 })],
      account({ openingBalanceCents: -MONTHLY }),
    );
    expect(balanceOn(prepaid, "2026-01-15")).toBe(9_900);
    expect(lateFeeSuggestion(prepaid, "2026-01", "2026-01-15")).toBeNull();
  });

  it("subtracts an earlier unpaid charge from the carried credit", () => {
    const partial = ledger(
      [...paidThroughFebruary, pay("2026-02-27", 300_000)],
      [entry({ entryDate: "2026-02-10", amountCents: 20_000 })],
    );
    expect(balanceOn(partial, "2026-02-28")).toBe(-280_000);
    expect(lateFeeSuggestion(partial, "2026-03", "2026-03-15")).toMatchObject({
      month: "2026-03",
    });
  });

  it("suggests nothing for an old unpaid adjustment when this month is paid", () => {
    const oldCharge = ledger(
      [...paidThroughFebruary, pay("2026-03-02")],
      [entry({ entryDate: "2026-02-10", amountCents: 20_000 })],
    );
    expect(balanceOn(oldCharge, "2026-03-20")).toBe(20_000);
    expect(lateFeeSuggestion(oldCharge, "2026-03", "2026-03-20")).toBeNull();
  });

  it("suggests nothing for a true-up balance alone", () => {
    const trueUp = ledger(
      [...paidThroughFebruary, pay("2026-03-01")],
      [
        entry({
          kind: "true_up",
          entryDate: "2026-01-15",
          amountCents: 81_240,
          note: null,
          reconciliationYearId: "y2025",
        }),
      ],
    );
    expect(balanceOn(trueUp, "2026-03-20")).toBe(81_240);
    expect(lateFeeSuggestion(trueUp, "2026-03", "2026-03-20")).toBeNull();
  });

  it("suggests nothing once the balance is 0", () => {
    const caughtUp = ledger([
      ...paidThroughFebruary,
      pay("2026-03-04", 300_000),
      pay("2026-03-12", 65_482),
    ]);
    expect(balanceOn(caughtUp, "2026-03-15")).toBe(0);
    expect(lateFeeSuggestion(caughtUp, "2026-03", "2026-03-15")).toBeNull();
  });

  it("suggests nothing once the month has a fee or a dismissal", () => {
    const short = [...paidThroughFebruary, pay("2026-03-04", 300_000)];
    const fee = entry({
      kind: "late_fee",
      entryDate: "2026-03-11",
      amountCents: FEE,
      note: null,
      feeMonth: "2026-03",
    });
    const dismissed = entry({
      kind: "late_fee_dismissed",
      entryDate: "2026-03-12",
      amountCents: 0,
      note: null,
      feeMonth: "2026-03",
    });
    const february = entry({
      kind: "late_fee",
      entryDate: "2026-02-11",
      amountCents: FEE,
      note: null,
      feeMonth: "2026-02",
    });

    expect(isLateFeeDecided(ledger(short, [fee]), "2026-03")).toBe(true);
    expect(
      lateFeeSuggestion(ledger(short, [fee]), "2026-03", "2026-03-15"),
    ).toBeNull();
    expect(
      lateFeeSuggestion(ledger(short, [dismissed]), "2026-03", "2026-03-15"),
    ).toBeNull();
    expect(
      lateFeeSuggestion(ledger(short, [february]), "2026-03", "2026-03-15"),
    ).toMatchObject({ month: "2026-03" });
  });

  it("suggests nothing when the covering lease has no late fee", () => {
    const noFee = ledger(paidThroughFebruary, [], account({ lateFee: null }));
    expect(lateFeeSuggestion(noFee, "2026-03", "2026-03-20")).toBeNull();
  });

  it("uses the covering lease's fee amount and day", () => {
    const terms = account({ lateFee: { amountCents: 7_500, day: 3 } });
    expect(
      lateFeeSuggestion(
        ledger(paidThroughFebruary, [], terms),
        "2026-03",
        "2026-03-04",
      ),
    ).toEqual({
      accountId: "a",
      month: "2026-03",
      amountCents: 7_500,
      feeDate: "2026-03-03",
    });
  });

  it("treats a check that bounces after the fee date as paid", () => {
    const bounced = ledger([
      ...paidThroughFebruary,
      pay("2026-03-03"),
      pay("2026-03-15", -MONTHLY),
    ]);
    expect(balanceOn(bounced, "2026-03-20")).toBe(MONTHLY);
    expect(lateFeeSuggestion(bounced, "2026-03", "2026-03-20")).toBeNull();
  });

  it("suggests the fee when the check bounces by the fee date", () => {
    const bounced = ledger([
      ...paidThroughFebruary,
      pay("2026-03-03"),
      pay("2026-03-08", -MONTHLY),
    ]);
    expect(lateFeeSuggestion(bounced, "2026-03", "2026-03-20")).toMatchObject({
      month: "2026-03",
    });
  });

  describe("a tenant who moves in on March 15", () => {
    const terms = account({ startDate: "2026-03-15" });

    it("uses the move-in day as the fee date, never the 10th", () => {
      const unpaid = ledger([], [], terms);
      expect(lateFeeSuggestion(unpaid, "2026-03", "2026-03-11")).toBeNull();
      expect(lateFeeSuggestion(unpaid, "2026-03", "2026-03-15")).toBeNull();
      const suggestion = lateFeeSuggestion(unpaid, "2026-03", "2026-03-16");
      expect(suggestion).toEqual({
        accountId: "a",
        month: "2026-03",
        amountCents: FEE,
        feeDate: "2026-03-15",
      });
      if (!suggestion) throw new Error("expected a suggestion");
      expect(lateFeeEntryDate(suggestion, "2026-03-16", [])).toEqual({
        entryDate: "2026-03-16",
        movedFrom: null,
      });
    });

    it("counts a payment on move-in day", () => {
      const paid = ledger([pay("2026-03-15")], [], terms);
      expect(lateFeeSuggestion(paid, "2026-03", "2026-03-20")).toBeNull();
    });

    it("counts a payment made before move-in as carried credit", () => {
      const paidAhead = ledger([pay("2026-03-09")], [], terms);
      expect(lateFeeSuggestion(paidAhead, "2026-03", "2026-03-20")).toBeNull();
    });
  });

  it("suggests nothing for a month that is not counted", () => {
    const noTracking: AccountLedger = {
      ...ledger(paidThroughFebruary),
      trackingStart: null,
    };
    expect(lateFeeSuggestion(noTracking, "2026-03", "2026-03-20")).toBeNull();
    const upcoming = ledger([], [], account({ startDate: "2026-04-01" }));
    expect(lateFeeSuggestion(upcoming, "2026-03", "2026-03-20")).toBeNull();
  });
});

describe("lateFeeEntryDate", () => {
  const suggestion = {
    accountId: "a",
    month: "2026-12",
    amountCents: FEE,
    feeDate: "2026-12-10",
  };

  it("dates the fee the day after the fee date", () => {
    expect(lateFeeEntryDate(suggestion, "2026-12-20", [2025])).toEqual({
      entryDate: "2026-12-11",
      movedFrom: null,
    });
  });

  it("moves the date to the approval day when that year is finalized", () => {
    expect(lateFeeEntryDate(suggestion, "2026-12-20", [2026])).toEqual({
      entryDate: "2026-12-20",
      movedFrom: "2026-12-11",
    });
  });
});
