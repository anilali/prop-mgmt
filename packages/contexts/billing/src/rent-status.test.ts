import { describe, expect, it } from "vitest";

import type { AccountLedger, AccountPayment } from "./balance";
import type { RentStatus } from "./rent-status";
import type { AccountTerms, LedgerEntry } from "./types";
import { compareRentStatus, graceDate, rentStatus } from "./rent-status";

const RENT = 300_000;

function account(
  options: {
    startDate?: string;
    moveOutDate?: string | null;
    lateFeeDay?: number | null;
  } = {},
): AccountTerms {
  const startDate = options.startDate ?? "2025-06-01";
  const lateFeeDay = options.lateFeeDay === undefined ? 10 : options.lateFeeDay;
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
        lateFee:
          lateFeeDay === null ? null : { amountCents: 5_000, day: lateFeeDay },
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
    transactionId: `t-${postedOn}`,
    postedOn,
    description: "Rent",
    amountCents,
  };
}

function ledger(
  terms: AccountTerms,
  payments: AccountPayment[],
  entries: LedgerEntry[] = [],
): AccountLedger {
  return { account: terms, trackingStart: "2026-01-01", payments, entries };
}

const paidThroughFebruary = [pay("2026-01-01"), pay("2026-02-01")];

const paidThroughSeptember = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
].map((month) => pay(`2026-${month}-01`));

describe("rentStatus", () => {
  it("is Paid at a zero balance", () => {
    expect(
      rentStatus(
        ledger(account(), [...paidThroughFebruary, pay("2026-03-02")]),
        "2026-03-20",
      ),
    ).toBe("paid");
  });

  it("is Credit when the tenant paid ahead", () => {
    expect(
      rentStatus(
        ledger(account(), [...paidThroughFebruary, pay("2026-02-27")]),
        "2026-02-28",
      ),
    ).toBe("credit");
  });

  it("is Due through the late-fee day and Behind the day after", () => {
    const l = ledger(account(), paidThroughFebruary);
    expect(rentStatus(l, "2026-03-01")).toBe("due");
    expect(rentStatus(l, "2026-03-10")).toBe("due");
    expect(rentStatus(l, "2026-03-11")).toBe("behind");
  });

  it("is Behind right away with a balance from last month", () => {
    const l = ledger(account(), [
      pay("2026-01-01"),
      pay("2026-02-03", RENT - 100),
    ]);
    expect(rentStatus(l, "2026-03-01")).toBe("behind");
  });

  it("uses the 5th when the lease has no late fee", () => {
    const l = ledger(account({ lateFeeDay: null }), paidThroughFebruary);
    expect(graceDate(l, "2026-03-02")).toBe("2026-03-05");
    expect(rentStatus(l, "2026-03-05")).toBe("due");
    expect(rentStatus(l, "2026-03-06")).toBe("behind");
  });

  it("is Due on a mid-month move-in day, past the fee day", () => {
    const l = ledger(account({ startDate: "2026-02-15" }), []);
    expect(graceDate(l, "2026-02-15")).toBe("2026-02-15");
    expect(rentStatus(l, "2026-02-15")).toBe("due");
    expect(rentStatus(l, "2026-02-16")).toBe("behind");
  });

  it("counts a charge added this month as this month's", () => {
    const charge: LedgerEntry = {
      id: "e",
      propertyId: "p",
      accountId: "a",
      kind: "adjustment",
      entryDate: "2026-03-03",
      amountCents: 2_500,
      note: "Key replacement",
      feeMonth: null,
      reconciliationYearId: null,
    };
    const l = ledger(account(), paidThroughFebruary, [charge]);
    expect(rentStatus(l, "2026-03-04")).toBe("due");
  });

  it("uses the newest lease's fee day in holdover", () => {
    const [lease] = account().leases;
    if (!lease) throw new Error("missing lease");
    const terms: AccountTerms = {
      ...account(),
      leases: [
        { ...lease, leaseId: "old", endDate: "2025-12-31" },
        {
          ...lease,
          leaseId: "new",
          startDate: "2026-01-01",
          endDate: "2026-06-30",
          lateFee: { amountCents: 5_000, day: 3 },
          rentSteps: [
            {
              id: "r2",
              startsOn: "2026-01-01",
              amountCents: RENT,
              tenantNotifiedAt: null,
            },
          ],
        },
      ],
    };
    const l = ledger(terms, paidThroughSeptember);
    expect(graceDate(l, "2026-10-01")).toBe("2026-10-03");
    expect(rentStatus(l, "2026-10-03")).toBe("due");
    expect(rentStatus(l, "2026-10-04")).toBe("behind");
  });

  it("puts a payment toward the oldest charge first", () => {
    const septemberCharge: LedgerEntry = {
      id: "e",
      propertyId: "p",
      accountId: "a",
      kind: "adjustment",
      entryDate: "2026-09-20",
      amountCents: 2_500,
      note: "Key replacement",
      feeMonth: null,
      reconciliationYearId: null,
    };
    const l = ledger(
      account(),
      [...paidThroughSeptember, pay("2026-10-01")],
      [septemberCharge],
    );
    expect(rentStatus(l, "2026-10-04")).toBe("due");
    expect(rentStatus(l, "2026-10-10")).toBe("due");
    expect(rentStatus(l, "2026-10-11")).toBe("behind");
  });

  it("is Behind for a closed account that still owes", () => {
    const l = ledger(account({ moveOutDate: "2026-01-31" }), [
      pay("2026-01-01", RENT - 1),
    ]);
    expect(rentStatus(l, "2026-03-02")).toBe("behind");
  });
});

describe("compareRentStatus", () => {
  it("puts Behind first, then Due, then the rest, largest balance first", () => {
    const rows: { status: RentStatus; balanceCents: number }[] = [
      { status: "paid", balanceCents: 0 },
      { status: "due", balanceCents: 100 },
      { status: "credit", balanceCents: -50 },
      { status: "behind", balanceCents: 10 },
      { status: "due", balanceCents: 300 },
      { status: "behind", balanceCents: 500 },
    ];
    expect(rows.sort(compareRentStatus)).toEqual([
      { status: "behind", balanceCents: 500 },
      { status: "behind", balanceCents: 10 },
      { status: "due", balanceCents: 300 },
      { status: "due", balanceCents: 100 },
      { status: "paid", balanceCents: 0 },
      { status: "credit", balanceCents: -50 },
    ]);
  });
});
