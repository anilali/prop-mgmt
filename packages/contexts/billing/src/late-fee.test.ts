import { describe, expect, it } from "vitest";

import type { AccountLedger, AccountPayment } from "./balance";
import type { AccountTerms, LeaseTerms, LedgerEntry, Txn } from "./types";
import { accountPayments, balanceOn } from "./balance";
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

function lease(
  options: {
    leaseId?: string;
    startDate?: string;
    endDate?: string;
    moveOutDate?: string | null;
    lateFee?: { amountCents: number; day: number } | null;
    rentCents?: number;
    camCents?: number;
  } = {},
): LeaseTerms {
  const startDate = options.startDate ?? "2025-06-01";
  return {
    leaseId: options.leaseId ?? "l",
    startDate,
    endDate: options.endDate ?? "2027-12-31",
    moveOutDate: options.moveOutDate ?? null,
    lateFee:
      options.lateFee === undefined
        ? { amountCents: FEE, day: 10 }
        : options.lateFee,
    insuranceExpiresOn: null,
    rentSteps: [
      {
        id: `r-${startDate}`,
        startsOn: startDate,
        amountCents: options.rentCents ?? RENT,
        tenantNotifiedAt: null,
      },
    ],
    estimateSteps: [
      {
        id: `e-${startDate}`,
        poolId: "cam",
        startsOn: startDate,
        amountCents: options.camCents ?? CAM,
      },
    ],
  };
}

function account(
  options: Parameters<typeof lease>[0] & {
    accountId?: string;
    openingBalanceCents?: number;
  } = {},
): AccountTerms {
  return accountWith([lease(options)], options);
}

function accountWith(
  leases: LeaseTerms[],
  options: { accountId?: string; openingBalanceCents?: number } = {},
): AccountTerms {
  return {
    accountId: options.accountId ?? "a",
    tenantId: "t",
    unitId: "u",
    openingBalanceCents: options.openingBalanceCents ?? 0,
    leases,
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
    expect(lateFeeSuggestion(short, "2026-03", "2026-04-01")).toBeNull();
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

  it("ignores an owed opening balance", () => {
    const owed = ledger(
      [pay("2026-01-02")],
      [],
      account({ openingBalanceCents: 80_000 }),
    );
    expect(balanceOn(owed, "2026-01-15")).toBe(80_000);
    expect(lateFeeSuggestion(owed, "2026-01", "2026-01-15")).toBeNull();
  });

  it("carries only the amount paid beyond earlier monthly charges", () => {
    const partial = ledger([
      ...paidThroughFebruary,
      pay("2026-02-27", 300_000),
    ]);
    expect(lateFeeSuggestion(partial, "2026-03", "2026-03-15")).toMatchObject({
      month: "2026-03",
    });
  });

  it("does not let an earlier unpaid adjustment eat the carried credit", () => {
    const early = ledger(
      [...paidThroughFebruary, pay("2026-02-27")],
      [entry({ entryDate: "2026-02-10", amountCents: 20_000 })],
    );
    expect(balanceOn(early, "2026-02-28")).toBe(-MONTHLY + 20_000);
    expect(lateFeeSuggestion(early, "2026-03", "2026-03-15")).toBeNull();
  });

  it("counts a credit adjustment as received", () => {
    const credited = ledger(
      [...paidThroughFebruary, pay("2026-03-05", MONTHLY - 15_000)],
      [entry({ entryDate: "2026-03-03", amountCents: -15_000 })],
    );
    expect(lateFeeSuggestion(credited, "2026-03", "2026-03-15")).toBeNull();
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

  it("ignores an earlier month's late fee", () => {
    const withFebruaryFee = ledger(
      [...paidThroughFebruary, pay("2026-03-02")],
      [
        entry({
          kind: "late_fee",
          entryDate: "2026-02-11",
          amountCents: FEE,
          note: null,
          feeMonth: "2026-02",
        }),
      ],
    );
    expect(
      lateFeeSuggestion(withFebruaryFee, "2026-03", "2026-03-20"),
    ).toBeNull();
  });

  it("still suggests the fee after the tenant catches up late", () => {
    const caughtUp = ledger([
      ...paidThroughFebruary,
      pay("2026-03-04", 300_000),
      pay("2026-03-12", 65_482),
    ]);
    expect(balanceOn(caughtUp, "2026-03-15")).toBe(0);
    expect(lateFeeSuggestion(caughtUp, "2026-03", "2026-03-15")).toMatchObject({
      month: "2026-03",
    });
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

  it("allows a fee on February 28 when the fee day is 27", () => {
    const terms = account({ lateFee: { amountCents: FEE, day: 27 } });
    const unpaid = ledger([pay("2026-01-01")], [], terms);
    expect(lateFeeSuggestion(unpaid, "2026-02", "2026-02-27")).toBeNull();
    expect(lateFeeSuggestion(unpaid, "2026-02", "2026-02-28")).toMatchObject({
      feeDate: "2026-02-27",
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

  it("never suggests a fee for the month of a move-in on its last day", () => {
    const unpaid = ledger([], [], account({ startDate: "2026-10-31" }));
    expect(lateFeeSuggestion(unpaid, "2026-10", "2026-10-31")).toBeNull();
    expect(lateFeeSuggestion(unpaid, "2026-10", "2026-11-01")).toBeNull();
    expect(lateFeeSuggestions(unpaid, "2026-11-01")).toEqual([]);
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

describe("owner scenarios for October 2026", () => {
  const OCT_RENT = 300_000;
  const OCT_CAM = 50_000;
  const EXPECTED = OCT_RENT + OCT_CAM;
  const terms = account({ rentCents: OCT_RENT, camCents: OCT_CAM });
  const paidThrough = (lastMonth: number) =>
    Array.from({ length: lastMonth }, (_, i) =>
      pay(`2026-${String(i + 1).padStart(2, "0")}-01`, EXPECTED),
    );
  const october = (
    payments: AccountPayment[],
    entries: LedgerEntry[] = [],
    today = "2026-10-11",
    accountTerms: AccountTerms = terms,
  ) =>
    lateFeeSuggestion(
      ledger(payments, entries, accountTerms),
      "2026-10",
      today,
    );

  it("suggests nothing for an autopay on the 5th", () => {
    expect(
      october([...paidThrough(9), pay("2026-10-05", EXPECTED)]),
    ).toBeNull();
  });

  it("suggests the fee when the payment is short by $1", () => {
    const short = [...paidThrough(9), pay("2026-10-05", EXPECTED - 100)];
    expect(october(short)).toMatchObject({ amountCents: FEE });
    expect(
      october([...short, pay("2026-10-12", 100)], [], "2026-10-13"),
    ).toMatchObject({ amountCents: FEE });
  });

  it("suggests nothing for an early payment on September 30 with an unpaid February adjustment", () => {
    const early = [...paidThrough(9), pay("2026-09-30", EXPECTED)];
    const adjustment = entry({ entryDate: "2026-02-10", amountCents: 20_000 });
    expect(balanceOn(ledger(early, [adjustment], terms), "2026-10-11")).toBe(
      20_000,
    );
    expect(october(early, [adjustment])).toBeNull();
  });

  it("suggests the fee for a payment on the 11th, from the 11th to the end of the month", () => {
    const late = [...paidThrough(9), pay("2026-10-11", EXPECTED)];
    expect(october(late, [], "2026-10-10")).toBeNull();
    expect(october(late, [], "2026-10-11")).toMatchObject({
      feeDate: "2026-10-10",
    });
    expect(october(late, [], "2026-10-31")).toMatchObject({
      feeDate: "2026-10-10",
    });
    expect(october(late, [], "2026-11-01")).toBeNull();
  });

  it("suggests nothing in October when September was short $100 and October was paid by the 10th", () => {
    const payments = [
      ...paidThrough(8),
      pay("2026-09-01", EXPECTED - 10_000),
      pay("2026-10-10", EXPECTED),
    ];
    expect(balanceOn(ledger(payments, [], terms), "2026-10-11")).toBe(10_000);
    expect(october(payments)).toBeNull();
  });

  it("counts a credit true-up dated October 2 toward October", () => {
    const trueUp = entry({
      kind: "true_up",
      entryDate: "2026-10-02",
      amountCents: -40_000,
      note: null,
      reconciliationYearId: "y2025",
    });
    const payments = [...paidThrough(9), pay("2026-10-05", 310_000)];
    expect(october(payments, [trueUp])).toBeNull();
    expect(
      october(payments, [trueUp, entry({ entryDate: "2026-02-10" })]),
    ).toBeNull();
  });

  it("suggests nothing for a true-up debit alone", () => {
    const trueUp = entry({
      kind: "true_up",
      entryDate: "2026-01-20",
      amountCents: 40_000,
      note: null,
      reconciliationYearId: "y2025",
    });
    expect(
      october([...paidThrough(9), pay("2026-10-05", EXPECTED)], [trueUp]),
    ).toBeNull();
  });

  it("counts a prepaid opening balance", () => {
    const prepaid = account({
      rentCents: OCT_RENT,
      camCents: OCT_CAM,
      openingBalanceCents: -EXPECTED,
    });
    expect(october(paidThrough(9), [], "2026-10-11", prepaid)).toBeNull();
    expect(
      lateFeeSuggestion(ledger([], [], prepaid), "2026-01", "2026-01-11"),
    ).toBeNull();
    expect(
      lateFeeSuggestion(ledger([], [], prepaid), "2026-02", "2026-02-11"),
    ).toMatchObject({ month: "2026-02" });
  });

  it("suggests nothing when a check bounces on the 3rd and is replaced on the 8th", () => {
    expect(
      october([
        ...paidThrough(9),
        pay("2026-10-01", EXPECTED),
        pay("2026-10-03", -EXPECTED),
        pay("2026-10-08", EXPECTED),
      ]),
    ).toBeNull();
  });

  it("suggests the fee when a bounced check is not replaced by the fee date", () => {
    const bounced = [
      ...paidThrough(9),
      pay("2026-10-01", EXPECTED),
      pay("2026-10-03", -EXPECTED),
    ];
    expect(october(bounced)).toMatchObject({ amountCents: FEE });
    expect(
      october([...bounced, pay("2026-10-12", EXPECTED)], [], "2026-10-13"),
    ).toMatchObject({ amountCents: FEE });
  });

  it("checks each account's share of a payment split across two accounts", () => {
    const txns: Txn[] = [
      {
        id: "t-split",
        propertyId: "p",
        source: "bank",
        importBatchId: null,
        postedOn: "2026-10-05",
        description: "ACH DEPOSIT",
        descriptionKey: "ach deposit",
        amountCents: EXPECTED * 2 - 10_000,
        externalId: null,
        lines: [
          { accountId: "a", categoryId: null, amountCents: EXPECTED },
          { accountId: "b", categoryId: null, amountCents: EXPECTED - 10_000 },
        ],
      },
    ];
    const termsB = account({
      accountId: "b",
      rentCents: OCT_RENT,
      camCents: OCT_CAM,
    });
    expect(
      october([...paidThrough(9), ...accountPayments(txns, "a")]),
    ).toBeNull();
    expect(
      october(
        [...paidThrough(9), ...accountPayments(txns, "b")],
        [],
        "2026-10-11",
        termsB,
      ),
    ).toMatchObject({ accountId: "b", amountCents: FEE });
  });

  it("counts two payments that together cover the month", () => {
    expect(
      october([
        ...paidThrough(9),
        pay("2026-10-05", 200_000),
        pay("2026-10-06", 150_000),
      ]),
    ).toBeNull();
  });

  it("uses the move-in day as the fee date for a mid-month move-in", () => {
    const midMonth = account({
      startDate: "2026-10-15",
      rentCents: OCT_RENT,
      camCents: OCT_CAM,
    });
    expect(october([], [], "2026-10-15", midMonth)).toBeNull();
    expect(october([], [], "2026-10-16", midMonth)).toMatchObject({
      feeDate: "2026-10-15",
    });
    expect(
      october([pay("2026-10-14", EXPECTED)], [], "2026-10-16", midMonth),
    ).toBeNull();
  });

  it("uses the lease that covers the due date after a renewal", () => {
    const renewedOnFirst = accountWith([
      lease({
        startDate: "2025-10-01",
        endDate: "2026-09-30",
        rentCents: OCT_RENT,
        camCents: OCT_CAM,
      }),
      lease({
        leaseId: "l2",
        startDate: "2026-10-01",
        lateFee: { amountCents: 7_500, day: 5 },
        rentCents: OCT_RENT,
        camCents: OCT_CAM,
      }),
    ]);
    expect(
      october(paidThrough(9), [], "2026-10-05", renewedOnFirst),
    ).toBeNull();
    expect(
      october(paidThrough(9), [], "2026-10-06", renewedOnFirst),
    ).toMatchObject({ amountCents: 7_500, feeDate: "2026-10-05" });

    const renewedMidMonth = accountWith([
      lease({
        startDate: "2025-10-01",
        endDate: "2026-10-14",
        rentCents: OCT_RENT,
        camCents: OCT_CAM,
      }),
      lease({
        leaseId: "l2",
        startDate: "2026-10-15",
        lateFee: { amountCents: 7_500, day: 5 },
        rentCents: OCT_RENT,
        camCents: OCT_CAM,
      }),
    ]);
    expect(
      october(paidThrough(9), [], "2026-10-11", renewedMidMonth),
    ).toMatchObject({ amountCents: FEE, feeDate: "2026-10-10" });
  });

  it("suggests the fee in holdover", () => {
    const holdover = account({
      endDate: "2026-06-30",
      rentCents: OCT_RENT,
      camCents: OCT_CAM,
    });
    expect(october(paidThrough(9), [], "2026-10-11", holdover)).toMatchObject({
      amountCents: FEE,
    });
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
