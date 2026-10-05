import { describe, expect, it } from "vitest";

import type { AccountTerms, LeaseTerms } from "./types";
import {
  accountEnd,
  accountsOverlap,
  accountStart,
  accountState,
  countedMonths,
  coveringLease,
  dueDate,
  estimateOn,
  isCounted,
  isHoldover,
  leaseForMonth,
  monthCharges,
  monthlyExpected,
  newestLease,
  openOn,
  paysOn,
  paysPool,
  rentOn,
  stepOn,
} from "./lease-calendar";

function lease(
  leaseId: string,
  startDate: string,
  endDate: string,
  moveOutDate: string | null = null,
): LeaseTerms {
  return {
    leaseId,
    startDate,
    endDate,
    moveOutDate,
    lateFee: null,
    insuranceExpiresOn: null,
    rentSteps: [
      {
        id: `${leaseId}-r`,
        startsOn: startDate,
        amountCents: 1,
        tenantNotifiedAt: null,
      },
    ],
    estimateSteps: [],
  };
}

function account(leases: LeaseTerms[], accountId = "a"): AccountTerms {
  return {
    accountId,
    tenantId: "t",
    unitId: "u",
    openingBalanceCents: 0,
    leases,
  };
}

describe("account start and end", () => {
  it("uses the earliest start and the newest lease's move-out", () => {
    const a = account([
      lease("b2", "2024-06-15", "2025-06-14", "2025-03-31"),
      lease("b1", "2023-06-15", "2024-06-14"),
    ]);

    expect(accountStart(a)).toBe("2023-06-15");
    expect(newestLease(a).leaseId).toBe("b2");
    expect(accountEnd(a)).toBe("2025-03-31");
  });

  it("has no end while the newest lease has no move-out", () => {
    expect(accountEnd(account([lease("l", "2024-01-01", "2024-12-31")]))).toBe(
      null,
    );
  });

  it("throws for an account with no leases", () => {
    expect(() => accountStart(account([]))).toThrow("Account a has no leases");
  });
});

describe("openOn", () => {
  const a = account([lease("l", "2024-03-20", "2025-03-19", "2024-08-01")]);

  it("is open from the start through the move-out date", () => {
    expect(openOn(a, "2024-03-19")).toBe(false);
    expect(openOn(a, "2024-03-20")).toBe(true);
    expect(openOn(a, "2024-08-01")).toBe(true);
    expect(openOn(a, "2024-08-02")).toBe(false);
  });
});

describe("accountState", () => {
  it("is upcoming before the start", () => {
    const a = account([lease("l", "2024-03-20", "2025-03-19")]);
    expect(accountState(a, "2024-03-19")).toBe("upcoming");
    expect(accountState(a, "2024-03-20")).toBe("open");
  });

  it("is in holdover after the newest lease ends with no move-out", () => {
    const a = account([lease("l", "2024-01-01", "2024-09-30")]);
    expect(isHoldover(a, "2024-09-30")).toBe(false);
    expect(accountState(a, "2024-09-30")).toBe("open");
    expect(isHoldover(a, "2024-10-01")).toBe(true);
    expect(accountState(a, "2024-10-01")).toBe("holdover");
  });

  it("is closed after the move-out date", () => {
    const a = account([lease("l", "2022-09-01", "2025-08-31", "2024-08-15")]);
    expect(accountState(a, "2024-08-15")).toBe("open");
    expect(accountState(a, "2024-08-16")).toBe("closed");
  });
});

describe("coveringLease", () => {
  const a = account([
    lease("old", "2023-06-15", "2024-06-14"),
    lease("new", "2024-06-15", "2025-06-14"),
  ]);

  it("is the newest lease that has started", () => {
    expect(coveringLease(a, "2023-06-14")).toBeNull();
    expect(coveringLease(a, "2024-06-01")?.leaseId).toBe("old");
    expect(coveringLease(a, "2024-06-15")?.leaseId).toBe("new");
    expect(coveringLease(a, "2026-01-01")?.leaseId).toBe("new");
  });

  it("keeps the old lease through a gap", () => {
    const gap = account([
      lease("old", "2024-01-01", "2024-05-31"),
      lease("new", "2024-07-01", "2024-12-31"),
    ]);
    expect(coveringLease(gap, "2024-06-01")?.leaseId).toBe("old");
  });
});

describe("accountsOverlap", () => {
  it("detects overlap with an account that has no end", () => {
    const open = account([lease("l", "2024-01-01", "2024-12-31")], "a");
    const later = account([lease("m", "2026-01-01", "2026-12-31")], "b");
    expect(accountsOverlap(open, later)).toBe(true);
  });

  it("allows an account after a move-out", () => {
    const closed = account(
      [lease("l", "2024-01-01", "2024-12-31", "2024-08-15")],
      "a",
    );
    const next = account([lease("m", "2024-08-16", "2025-08-15")], "b");
    const sameDay = account([lease("m", "2024-08-15", "2025-08-14")], "c");
    expect(accountsOverlap(closed, next)).toBe(false);
    expect(accountsOverlap(next, closed)).toBe(false);
    expect(accountsOverlap(closed, sameDay)).toBe(true);
  });

  it("allows an earlier account that ended before", () => {
    const earlier = account(
      [lease("l", "2022-01-01", "2022-12-31", "2022-12-31")],
      "a",
    );
    const current = account([lease("m", "2023-01-01", "2023-12-31")], "b");
    expect(accountsOverlap(current, earlier)).toBe(false);
  });
});

describe("paysPool", () => {
  it("is true when the lease has a step for the pool", () => {
    const l = lease("l", "2024-01-01", "2024-12-31");
    l.estimateSteps.push({
      id: "s",
      poolId: "water",
      startsOn: "2024-07-01",
      amountCents: 1,
    });
    expect(paysPool(l, "water")).toBe(true);
    expect(paysPool(l, "cam")).toBe(false);
  });
});

function termsLease(
  leaseId: string,
  startDate: string,
  endDate: string,
  options: {
    moveOutDate?: string | null;
    rent?: [string, number][];
    estimates?: [string, string, number][];
  } = {},
): LeaseTerms {
  return {
    leaseId,
    startDate,
    endDate,
    moveOutDate: options.moveOutDate ?? null,
    lateFee: null,
    insuranceExpiresOn: null,
    rentSteps: (options.rent ?? [[startDate, 100_000]]).map(
      ([startsOn, amountCents], index) => ({
        id: `${leaseId}-r${index}`,
        startsOn,
        amountCents,
        tenantNotifiedAt: null,
      }),
    ),
    estimateSteps: (options.estimates ?? []).map(
      ([poolId, startsOn, amountCents], index) => ({
        id: `${leaseId}-e${index}`,
        poolId,
        startsOn,
        amountCents,
      }),
    ),
  };
}

function months2024(a: AccountTerms, trackingStart = "2024-01-01") {
  return countedMonths(a, trackingStart, "2024-01", "2024-12");
}

function poolMonths2024(a: AccountTerms, poolId: string) {
  return months2024(a).filter((month) =>
    paysOn(leaseForMonth(a, month), poolId, dueDate(a, month)),
  ).length;
}

describe("stepOn", () => {
  const steps = [
    { startsOn: "2024-06-01", amountCents: 2 },
    { startsOn: "2024-01-01", amountCents: 1 },
  ];

  it("returns the step with the latest start on or before the date", () => {
    expect(stepOn(steps, "2023-12-31")).toBeNull();
    expect(stepOn(steps, "2024-01-01")?.amountCents).toBe(1);
    expect(stepOn(steps, "2024-05-31")?.amountCents).toBe(1);
    expect(stepOn(steps, "2024-06-01")?.amountCents).toBe(2);
    expect(stepOn(steps, "2030-01-01")?.amountCents).toBe(2);
  });
});

describe("counted months and due dates", () => {
  it("counts from a mid-month start and dues that month on the start date", () => {
    const a = account([termsLease("l", "2024-03-20", "2025-03-19")]);
    expect(months2024(a)).toHaveLength(10);
    expect(months2024(a)[0]).toBe("2024-03");
    expect(dueDate(a, "2024-03")).toBe("2024-03-20");
    expect(dueDate(a, "2024-04")).toBe("2024-04-01");
    expect(isCounted(a, "2024-02", "2024-01-01")).toBe(false);
  });

  it("keeps counting in holdover at the lease's last amounts", () => {
    const a = account([
      termsLease("l", "2024-01-01", "2024-09-30", {
        rent: [
          ["2024-01-01", 100_000],
          ["2024-06-01", 110_000],
        ],
      }),
    ]);
    expect(months2024(a)).toHaveLength(12);
    expect(monthlyExpected(a, "2024-10")).toBe(110_000);
    expect(monthlyExpected(a, "2024-12")).toBe(110_000);
    expect(isHoldover(a, "2024-10-01")).toBe(true);
  });

  it("counts the move-out month", () => {
    const a = account([
      termsLease("l", "2022-09-01", "2025-08-31", {
        moveOutDate: "2024-08-01",
      }),
    ]);
    expect(months2024(a)).toHaveLength(8);
    expect(months2024(a).at(-1)).toBe("2024-08");
  });

  it("starts at the tracking start date", () => {
    const a = account([termsLease("l", "2023-01-01", "2027-12-31")]);
    expect(months2024(a, "2024-04-01")).toHaveLength(9);
    expect(isCounted(a, "2024-03", "2024-04-01")).toBe(false);
  });

  it("bills a mid-month renewal from the next month", () => {
    const a = account([
      termsLease("old", "2023-06-15", "2024-06-14", {
        rent: [["2023-06-15", 100_000]],
      }),
      termsLease("new", "2024-06-15", "2025-06-14", {
        rent: [["2024-06-15", 120_000]],
      }),
    ]);
    expect(months2024(a)).toHaveLength(12);
    expect(leaseForMonth(a, "2024-06").leaseId).toBe("old");
    expect(monthlyExpected(a, "2024-06")).toBe(100_000);
    expect(leaseForMonth(a, "2024-07").leaseId).toBe("new");
    expect(monthlyExpected(a, "2024-07")).toBe(120_000);
  });

  it("bills a gap month at the old lease's last amounts", () => {
    const a = account([
      termsLease("old", "2023-06-01", "2024-05-31", {
        rent: [
          ["2023-06-01", 100_000],
          ["2024-01-01", 105_000],
        ],
      }),
      termsLease("new", "2024-07-01", "2025-06-30", {
        rent: [["2024-07-01", 120_000]],
      }),
    ]);
    expect(months2024(a)).toHaveLength(12);
    expect(monthlyExpected(a, "2024-06")).toBe(105_000);
    expect(monthlyExpected(a, "2024-07")).toBe(120_000);
  });

  it("counts a pool from its first step on or before the due date", () => {
    const fromFirst = account([
      termsLease("l", "2023-01-01", "2027-12-31", {
        estimates: [["water", "2024-07-01", 15_000]],
      }),
    ]);
    const midMonth = account([
      termsLease("l", "2023-01-01", "2027-12-31", {
        estimates: [["water", "2024-07-15", 15_000]],
      }),
    ]);
    expect(months2024(fromFirst)).toHaveLength(12);
    expect(poolMonths2024(fromFirst, "water")).toBe(6);
    expect(poolMonths2024(midMonth, "water")).toBe(5);
  });

  it("dues a mid-month account start on the start date", () => {
    const a = account([termsLease("l", "2024-02-15", "2025-02-14")]);
    expect(dueDate(a, "2024-02")).toBe("2024-02-15");
    expect(isCounted(a, "2024-02", "2024-01-01")).toBe(true);
  });
});

describe("monthCharges", () => {
  it("adds base rent and each estimate in effect on the due date", () => {
    const a = account([
      termsLease("l", "2023-01-01", "2027-12-31", {
        rent: [["2023-01-01", 250_000]],
        estimates: [
          ["cam", "2023-01-01", 26_861],
          ["tax", "2023-01-01", 77_761],
          ["ins", "2023-01-01", 10_860],
          ["water", "2024-07-01", 5_000],
        ],
      }),
    ]);

    const june = monthCharges(a, "2024-06");
    expect(june.rentCents).toBe(250_000);
    expect(june.estimates.map((e) => e.poolId)).toEqual(["cam", "tax", "ins"]);
    expect(june.totalCents).toBe(365_482);
    expect(monthlyExpected(a, "2024-07")).toBe(370_482);
  });

  it("looks up rent and estimates by date", () => {
    const l = termsLease("l", "2024-01-01", "2024-12-31", {
      rent: [
        ["2024-01-01", 100],
        ["2024-07-01", 200],
      ],
      estimates: [
        ["cam", "2024-03-01", 10],
        ["cam", "2024-09-01", 20],
      ],
    });
    expect(rentOn(l, "2024-06-30")).toBe(100);
    expect(rentOn(l, "2024-07-01")).toBe(200);
    expect(estimateOn(l, "cam", "2024-02-01")).toBeNull();
    expect(estimateOn(l, "cam", "2024-03-01")).toBe(10);
    expect(estimateOn(l, "cam", "2024-12-01")).toBe(20);
    expect(paysOn(l, "cam", "2024-02-29")).toBe(false);
  });
});
