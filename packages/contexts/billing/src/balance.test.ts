import { describe, expect, it } from "vitest";

import type { AccountLedger, AccountPayment } from "./balance";
import type { AccountTerms, LedgerEntry, Txn } from "./types";
import {
  accountBalance,
  accountPayments,
  balanceOn,
  expectedOn,
  historyRows,
  monthsDue,
  receivedOn,
} from "./balance";
import {
  superLucky,
  tenantB,
  tenantD,
  TRACKING_START,
  TRANSACTIONS,
} from "./fixtures/2024";

function ledgerFor(
  account: AccountTerms,
  options: {
    entries?: LedgerEntry[];
    transactions?: Txn[];
    trackingStart?: string | null;
  } = {},
): AccountLedger {
  return {
    account,
    trackingStart:
      options.trackingStart === undefined
        ? TRACKING_START
        : options.trackingStart,
    payments: accountPayments(
      options.transactions ?? TRANSACTIONS,
      account.accountId,
    ),
    entries: options.entries ?? [],
  };
}

function entry(
  accountId: string,
  overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "entryDate">,
): LedgerEntry {
  return {
    id: `entry-${overrides.entryDate}-${overrides.kind ?? "adjustment"}`,
    propertyId: "property-2024",
    accountId,
    kind: "adjustment",
    amountCents: 1_000,
    note: "Note",
    feeMonth: null,
    reconciliationYearId: null,
    ...overrides,
  };
}

describe("section 6 balances", () => {
  it("Super Lucky owes 413.74 at the end of 2024", () => {
    const ledger = ledgerFor(superLucky);
    expect(expectedOn(ledger, "2024-12-31")).toBe(4_385_784);
    expect(receivedOn(ledger, "2024-12-31")).toBe(4_344_410);
    expect(balanceOn(ledger, "2024-12-31")).toBe(41_374);
  });

  it("Tenant D is expected 17,280.00 over eight months and owes nothing", () => {
    const ledger = ledgerFor(tenantD);
    expect(expectedOn(ledger, "2024-12-31")).toBe(1_728_000);
    expect(monthsDue(tenantD, TRACKING_START, "2024-12-31")).toHaveLength(8);
    expect(balanceOn(ledger, "2024-12-31")).toBe(0);
  });

  it("Tenant B carries the opening balance across the renewal", () => {
    const ledger = ledgerFor(tenantB);
    expect(expectedOn(ledger, "2024-12-31")).toBe(5_052_500);
    expect(receivedOn(ledger, "2024-12-31")).toBe(5_027_500);
    expect(balanceOn(ledger, "2024-12-31")).toBe(25_000);
    const months = monthsDue(tenantB, TRACKING_START, "2024-12-31");
    expect(months.filter((m) => m.leaseId === "lease-b1")).toHaveLength(5);
    expect(months.filter((m) => m.leaseId === "lease-b2")).toHaveLength(7);
    expect(months[0]?.totalCents).toBe(407_000);
    expect(months[5]?.totalCents).toBe(427_500);
  });
});

describe("expected, received, and balance", () => {
  it("counts a month from its due date", () => {
    const ledger = ledgerFor(superLucky, { transactions: [] });
    expect(expectedOn(ledger, "2023-12-31")).toBe(0);
    expect(expectedOn(ledger, "2024-01-01")).toBe(365_482);
    expect(expectedOn(ledger, "2024-01-31")).toBe(365_482);
    expect(expectedOn(ledger, "2024-02-01")).toBe(730_964);
  });

  it("counts a mid-month start from the start date", () => {
    const account: AccountTerms = {
      ...superLucky,
      leases: superLucky.leases.map((lease) => ({
        ...lease,
        startDate: "2024-03-20",
        rentSteps: lease.rentSteps.map((s) => ({
          ...s,
          startsOn: "2024-03-20",
        })),
        estimateSteps: [],
      })),
    };
    const ledger = ledgerFor(account, { transactions: [] });
    expect(expectedOn(ledger, "2024-03-19")).toBe(0);
    expect(expectedOn(ledger, "2024-03-20")).toBe(250_000);
  });

  it("ignores payments before the tracking start and after the date", () => {
    const transactions = [
      ...TRANSACTIONS,
      {
        ...TRANSACTIONS[0],
        id: "early",
        postedOn: "2023-12-29",
      } as Txn,
    ];
    const ledger = ledgerFor(superLucky, { transactions });
    expect(receivedOn(ledger, "2024-01-01")).toBe(365_482);
  });

  it("adds ledger entries on their dates", () => {
    const entries = [
      entry(superLucky.accountId, {
        entryDate: "2024-03-11",
        amountCents: 5_000,
      }),
      entry(superLucky.accountId, {
        entryDate: "2024-04-01",
        kind: "late_fee_dismissed",
        amountCents: 0,
        note: null,
        feeMonth: "2024-03",
      }),
      entry(superLucky.accountId, {
        entryDate: "2025-01-01",
        amountCents: 23_774,
      }),
    ];
    const ledger = ledgerFor(superLucky, { entries });
    expect(balanceOn(ledger, "2024-03-10")).toBe(0);
    expect(balanceOn(ledger, "2024-03-11")).toBe(5_000);
    expect(balanceOn(ledger, "2024-12-31")).toBe(41_374 + 5_000);
  });

  it("keeps the identity: opening + months + entries - payments", () => {
    const entries = [
      entry(tenantB.accountId, {
        entryDate: "2024-02-10",
        amountCents: -12_500,
      }),
      entry(tenantB.accountId, { entryDate: "2024-09-30", amountCents: 7_725 }),
    ];
    const ledger = ledgerFor(tenantB, { entries });
    for (const [asOf, months] of [
      ["2024-01-01", 407_000],
      ["2024-05-31", 5 * 407_000],
      ["2024-06-15", 5 * 407_000 + 427_500],
      ["2024-12-31", 5 * 407_000 + 7 * 427_500],
    ] as const) {
      const entrySum = entries
        .filter((e) => e.entryDate <= asOf)
        .reduce((sum, e) => sum + e.amountCents, 0);
      const payments = ledger.payments
        .filter((p) => p.postedOn <= asOf)
        .reduce((sum, p) => sum + p.amountCents, 0);
      expect(balanceOn(ledger, asOf)).toBe(
        tenantB.openingBalanceCents + months + entrySum - payments,
      );
    }
  });

  it("reports the last payment date before a bounced December check", () => {
    const bounced: Txn = {
      ...TRANSACTIONS[0],
      id: "bounced",
      postedOn: "2024-12-15",
      amountCents: -324_108,
      lines: [
        {
          accountId: superLucky.accountId,
          categoryId: null,
          amountCents: -324_108,
        },
      ],
    } as Txn;
    const ledger = ledgerFor(superLucky, {
      transactions: [...TRANSACTIONS, bounced],
    });
    expect(accountBalance(ledger, "2024-12-31")).toEqual({
      expectedCents: 4_385_784,
      receivedCents: 4_020_302,
      balanceCents: 365_482,
      lastPaymentOn: "2024-11-01",
    });
  });

  it("skips a payment that a later line of the same amount takes back", () => {
    const payment = (postedOn: string, amountCents: number) => ({
      transactionId: `t-${postedOn}-${amountCents}`,
      postedOn,
      description: "Rent",
      amountCents,
    });
    const lastPaymentOn = (payments: AccountPayment[]) =>
      accountBalance(
        { ...ledgerFor(superLucky, { transactions: [] }), payments },
        "2024-12-31",
      ).lastPaymentOn;
    const paid = [
      payment("2024-01-01", 365_482),
      payment("2024-02-01", 365_482),
    ];

    expect(lastPaymentOn(paid)).toBe("2024-02-01");
    expect(lastPaymentOn([...paid, payment("2024-02-05", -365_482)])).toBe(
      "2024-01-01",
    );
    expect(
      lastPaymentOn([
        payment("2024-01-01", 365_482),
        payment("2024-02-01", -365_482),
        payment("2024-02-01", 365_482),
      ]),
    ).toBe("2024-01-01");
    expect(lastPaymentOn([...paid, payment("2024-02-05", -100)])).toBe(
      "2024-02-01",
    );
    expect(
      lastPaymentOn([
        ...paid,
        payment("2024-02-05", -365_482),
        payment("2024-02-10", 365_482),
      ]),
    ).toBe("2024-02-10");
    expect(lastPaymentOn([payment("2024-02-05", -365_482)])).toBeNull();
  });

  it("takes one payment per line to the account", () => {
    const split: Txn = {
      ...TRANSACTIONS[0],
      id: "split",
      postedOn: "2024-05-03",
      amountCents: 500_000,
      lines: [
        {
          accountId: superLucky.accountId,
          categoryId: null,
          amountCents: 300_000,
        },
        {
          accountId: tenantD.accountId,
          categoryId: null,
          amountCents: 200_000,
        },
      ],
    } as Txn;
    expect(accountPayments([split], superLucky.accountId)).toEqual([
      {
        transactionId: "split",
        postedOn: "2024-05-03",
        description: split.description,
        amountCents: 300_000,
      },
    ]);
  });

  it("has nothing counted without a tracking start", () => {
    const ledger = ledgerFor(superLucky, {
      trackingStart: null,
      transactions: [],
    });
    expect(expectedOn(ledger, "2024-12-31")).toBe(0);
  });
});

describe("history rows", () => {
  it("runs the balance through the given date, oldest first", () => {
    const entries = [
      entry(tenantB.accountId, { entryDate: "2024-03-01", amountCents: 5_000 }),
    ];
    const ledger = ledgerFor(tenantB, { entries });
    const rows = historyRows(ledger, "2024-03-15");

    expect(
      rows.map((r) => [r.kind, r.date, r.amountCents, r.balanceCents]),
    ).toEqual([
      ["opening", "2023-12-31", 25_000, 25_000],
      ["month", "2024-01-01", 407_000, 432_000],
      ["payment", "2024-01-01", -407_000, 25_000],
      ["month", "2024-02-01", 407_000, 432_000],
      ["payment", "2024-02-01", -407_000, 25_000],
      ["month", "2024-03-01", 407_000, 432_000],
      ["adjustment", "2024-03-01", 5_000, 437_000],
      ["payment", "2024-03-01", -407_000, 30_000],
    ]);
    expect(rows.at(-1)?.balanceCents).toBe(balanceOn(ledger, "2024-03-15"));
  });

  it("shows each month's base rent and estimates", () => {
    const rows = historyRows(ledgerFor(tenantB), "2024-06-30");
    const june = rows.find(
      (r) => r.kind === "month" && r.date === "2024-06-01",
    );
    expect(june).toMatchObject({
      kind: "month",
      month: "2024-06",
      leaseId: "lease-b2",
      rentCents: 315_000,
      amountCents: 427_500,
    });
    expect(june?.kind === "month" ? june.estimates : []).toHaveLength(4);
  });

  it("ends at the year-end balance for each section 6 account", () => {
    for (const [account, balance] of [
      [superLucky, 41_374],
      [tenantD, 0],
      [tenantB, 25_000],
    ] as const) {
      expect(
        historyRows(ledgerFor(account), "2024-12-31").at(-1)?.balanceCents,
      ).toBe(balance);
    }
  });

  it("shows a dismissed late fee with no amount", () => {
    const rows = historyRows(
      ledgerFor(superLucky, {
        entries: [
          entry(superLucky.accountId, {
            entryDate: "2024-01-11",
            kind: "late_fee_dismissed",
            amountCents: 0,
            note: null,
            feeMonth: "2024-01",
          }),
        ],
      }),
      "2024-01-31",
    );
    expect(rows.at(-1)).toMatchObject({
      kind: "late_fee_dismissed",
      feeMonth: "2024-01",
      amountCents: 0,
      balanceCents: 0,
    });
  });

  it("leaves out an opening row for an account that starts after tracking start", () => {
    const account: AccountTerms = {
      ...tenantD,
      leases: tenantD.leases.map((lease) => ({
        ...lease,
        startDate: "2024-02-15",
        rentSteps: lease.rentSteps.map((s) => ({
          ...s,
          startsOn: "2024-02-15",
        })),
        estimateSteps: lease.estimateSteps.map((s) => ({
          ...s,
          startsOn: "2024-02-15",
        })),
      })),
    };
    const rows = historyRows(
      ledgerFor(account, { transactions: [] }),
      "2024-02-20",
    );
    expect(rows.map((r) => [r.kind, r.date])).toEqual([
      ["month", "2024-02-15"],
    ]);
  });
});
