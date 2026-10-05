import { describe, expect, it } from "vitest";

import type { AccountTerms, LeaseTerms, Txn } from "./types";
import {
  comingUp,
  insuranceItems,
  leasesEnding,
  pastEndDate,
  rentChanges,
  toSortCount,
  withinNextDays,
} from "./coming-up";

const TODAY = "2026-10-05";

function lease(
  id: string,
  options: {
    startDate: string;
    endDate: string;
    moveOutDate?: string | null;
    insuranceExpiresOn?: string | null;
    steps?: [string, number][];
    notifiedAt?: Date | null;
  },
): LeaseTerms {
  const steps = options.steps ?? [[options.startDate, 250_000]];
  return {
    leaseId: id,
    startDate: options.startDate,
    endDate: options.endDate,
    moveOutDate: options.moveOutDate ?? null,
    lateFee: null,
    insuranceExpiresOn:
      options.insuranceExpiresOn === undefined
        ? "2027-06-30"
        : options.insuranceExpiresOn,
    rentSteps: steps.map(([startsOn, amountCents]) => ({
      id: `${id}-${startsOn}`,
      startsOn,
      amountCents,
      tenantNotifiedAt: options.notifiedAt ?? null,
    })),
    estimateSteps: [],
  };
}

function account(id: string, leases: LeaseTerms[]): AccountTerms {
  return {
    accountId: id,
    tenantId: `t-${id}`,
    unitId: `u-${id}`,
    openingBalanceCents: 0,
    leases,
  };
}

describe("withinNextDays", () => {
  it("includes today and the last day of the window", () => {
    expect(withinNextDays("2026-10-05", TODAY, 90)).toBe(true);
    expect(withinNextDays("2027-01-03", TODAY, 90)).toBe(true);
    expect(withinNextDays("2027-01-04", TODAY, 90)).toBe(false);
    expect(withinNextDays("2026-10-04", TODAY, 90)).toBe(false);
  });
});

describe("rentChanges", () => {
  it("lists steps in the next 90 days with the rent they replace", () => {
    const notified = new Date("2026-09-01T12:00:00Z");
    const accounts = [
      account("a", [
        lease("a1", {
          startDate: "2025-01-01",
          endDate: "2027-12-31",
          steps: [
            ["2025-01-01", 250_000],
            ["2026-10-04", 255_000],
            ["2026-10-05", 260_000],
            ["2027-01-03", 265_000],
            ["2027-01-04", 270_000],
          ],
          notifiedAt: notified,
        }),
      ]),
    ];

    expect(rentChanges(accounts, TODAY)).toEqual([
      {
        accountId: "a",
        leaseId: "a1",
        stepId: "a1-2026-10-05",
        startsOn: "2026-10-05",
        amountCents: 260_000,
        previousAmountCents: 255_000,
        tenantNotifiedAt: notified,
      },
      {
        accountId: "a",
        leaseId: "a1",
        stepId: "a1-2027-01-03",
        startsOn: "2027-01-03",
        amountCents: 265_000,
        previousAmountCents: 260_000,
        tenantNotifiedAt: notified,
      },
    ]);
  });

  it("skips the first step of an account's first lease and lists a renewal's first step", () => {
    const accounts = [
      account("new", [
        lease("n1", { startDate: "2026-11-01", endDate: "2027-10-31" }),
      ]),
      account("renewing", [
        lease("r1", { startDate: "2024-01-01", endDate: "2026-12-31" }),
        lease("r2", {
          startDate: "2027-01-01",
          endDate: "2029-12-31",
          steps: [["2027-01-01", 262_500]],
        }),
      ]),
    ];

    expect(
      rentChanges(accounts, TODAY).map((c) => [
        c.accountId,
        c.startsOn,
        c.amountCents,
        c.previousAmountCents,
      ]),
    ).toEqual([["renewing", "2027-01-01", 262_500, 250_000]]);
  });

  it("skips a step after the move-out date", () => {
    const accounts = [
      account("leaving", [
        lease("l1", {
          startDate: "2024-01-01",
          endDate: "2026-12-31",
          moveOutDate: "2026-10-31",
          steps: [
            ["2024-01-01", 250_000],
            ["2026-11-01", 260_000],
          ],
        }),
      ]),
    ];
    expect(rentChanges(accounts, TODAY)).toEqual([]);
  });
});

describe("insuranceItems", () => {
  it("flags missing, past, and expiring certificates on the lease covering today", () => {
    const accounts = [
      account("missing", [
        lease("m1", {
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          insuranceExpiresOn: null,
        }),
      ]),
      account("expired", [
        lease("e1", {
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          insuranceExpiresOn: "2026-10-04",
        }),
      ]),
      account("edge", [
        lease("g1", {
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          insuranceExpiresOn: "2026-12-04",
        }),
      ]),
      account("fine", [
        lease("f1", {
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          insuranceExpiresOn: "2026-12-05",
        }),
      ]),
      account("renewing", [
        lease("r1", {
          startDate: "2024-01-01",
          endDate: "2026-10-31",
          insuranceExpiresOn: "2026-10-31",
        }),
        lease("r2", {
          startDate: "2026-11-01",
          endDate: "2029-10-31",
          insuranceExpiresOn: "2027-10-31",
        }),
      ]),
    ];

    expect(insuranceItems(accounts, TODAY)).toEqual([
      {
        accountId: "missing",
        leaseId: "m1",
        insuranceExpiresOn: null,
        problem: "missing",
      },
      {
        accountId: "expired",
        leaseId: "e1",
        insuranceExpiresOn: "2026-10-04",
        problem: "expired",
      },
      {
        accountId: "renewing",
        leaseId: "r1",
        insuranceExpiresOn: "2026-10-31",
        problem: "expiring",
      },
      {
        accountId: "edge",
        leaseId: "g1",
        insuranceExpiresOn: "2026-12-04",
        problem: "expiring",
      },
    ]);
  });

  it("checks accounts opening in the next 60 days and holdover, not closed or later ones", () => {
    const accounts = [
      account("opening", [
        lease("o1", {
          startDate: "2026-12-04",
          endDate: "2027-12-31",
          insuranceExpiresOn: null,
        }),
      ]),
      account("later", [
        lease("l1", {
          startDate: "2026-12-05",
          endDate: "2027-12-31",
          insuranceExpiresOn: null,
        }),
      ]),
      account("closed", [
        lease("c1", {
          startDate: "2025-01-01",
          endDate: "2026-12-31",
          moveOutDate: "2026-10-04",
          insuranceExpiresOn: null,
        }),
      ]),
      account("holdover", [
        lease("h1", {
          startDate: "2024-01-01",
          endDate: "2026-09-30",
          insuranceExpiresOn: "2026-09-30",
        }),
      ]),
    ];

    expect(
      insuranceItems(accounts, TODAY).map((i) => [i.accountId, i.problem]),
    ).toEqual([
      ["opening", "missing"],
      ["holdover", "expired"],
    ]);
  });
});

describe("leasesEnding and pastEndDate", () => {
  const accounts = [
    account("today", [
      lease("a", { startDate: "2025-10-06", endDate: "2026-10-05" }),
    ]),
    account("inside", [
      lease("b", { startDate: "2024-01-04", endDate: "2027-01-03" }),
    ]),
    account("outside", [
      lease("c", { startDate: "2024-01-05", endDate: "2027-01-04" }),
    ]),
    account("movingOut", [
      lease("d", {
        startDate: "2024-01-01",
        endDate: "2026-12-31",
        moveOutDate: "2026-12-31",
      }),
    ]),
    account("holdover", [
      lease("e", { startDate: "2023-10-05", endDate: "2026-10-04" }),
    ]),
    account("closed", [
      lease("f", {
        startDate: "2023-10-05",
        endDate: "2026-09-30",
        moveOutDate: "2026-09-30",
      }),
    ]),
    account("renewed", [
      lease("g1", { startDate: "2024-01-01", endDate: "2026-12-31" }),
      lease("g2", { startDate: "2027-01-01", endDate: "2029-12-31" }),
    ]),
  ];

  it("lists newest leases ending in the next 90 days with no move-out date", () => {
    expect(leasesEnding(accounts, TODAY)).toEqual([
      { accountId: "today", leaseId: "a", endDate: "2026-10-05" },
      { accountId: "inside", leaseId: "b", endDate: "2027-01-03" },
    ]);
  });

  it("lists accounts in holdover", () => {
    expect(pastEndDate(accounts, TODAY)).toEqual([
      { accountId: "holdover", leaseId: "e", endDate: "2026-10-04" },
    ]);
  });

  it("returns every list at once", () => {
    const result = comingUp(accounts, TODAY);
    expect(result.leasesEnding).toHaveLength(2);
    expect(result.pastEndDate).toHaveLength(1);
    expect(result.rentChanges.map((c) => [c.accountId, c.startsOn])).toEqual([
      ["renewed", "2027-01-01"],
    ]);
    expect(result.insurance).toEqual([]);
  });
});

describe("toSortCount", () => {
  it("counts transactions with no lines", () => {
    const txn = (id: string, lines: Txn["lines"]): Txn => ({
      id,
      propertyId: "p",
      source: "bank",
      importBatchId: "b",
      postedOn: "2026-10-01",
      description: "DEPOSIT",
      descriptionKey: "deposit",
      amountCents: 1_000,
      externalId: null,
      lines,
    });
    expect(
      toSortCount([
        txn("1", []),
        txn("2", [{ accountId: "a", categoryId: null, amountCents: 1_000 }]),
        txn("3", []),
      ]),
    ).toBe(2);
  });
});
