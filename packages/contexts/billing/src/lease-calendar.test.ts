import { describe, expect, it } from "vitest";

import type { AccountTerms, LeaseTerms } from "./types";
import {
  accountEnd,
  accountsOverlap,
  accountStart,
  accountState,
  coveringLease,
  isHoldover,
  newestLease,
  openOn,
  paysPool,
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
