import type { IsoDate, YearMonth } from "@moonship/shared";
import { firstDay, lastDay, maxDate, monthsFromTo } from "@moonship/shared";

import type { AccountTerms, LeaseTerms } from "./types";

export type AccountState = "upcoming" | "open" | "holdover" | "closed";

function sortedLeases(account: AccountTerms): LeaseTerms[] {
  if (account.leases.length === 0) {
    throw new Error(`Account ${account.accountId} has no leases`);
  }
  return [...account.leases].sort((a, b) =>
    a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
  );
}

export function accountStart(account: AccountTerms): IsoDate {
  const first = sortedLeases(account)[0];
  if (!first) throw new Error(`Account ${account.accountId} has no leases`);
  return first.startDate;
}

export function newestLease(account: AccountTerms): LeaseTerms {
  const newest = sortedLeases(account).at(-1);
  if (!newest) throw new Error(`Account ${account.accountId} has no leases`);
  return newest;
}

export function accountEnd(account: AccountTerms): IsoDate | null {
  return newestLease(account).moveOutDate;
}

export function openOn(account: AccountTerms, date: IsoDate): boolean {
  const end = accountEnd(account);
  return accountStart(account) <= date && (end === null || date <= end);
}

export function isHoldover(account: AccountTerms, today: IsoDate): boolean {
  return accountEnd(account) === null && today > newestLease(account).endDate;
}

export function coveringLease(
  account: AccountTerms,
  date: IsoDate,
): LeaseTerms | null {
  let covering: LeaseTerms | null = null;
  for (const lease of sortedLeases(account)) {
    if (lease.startDate <= date) covering = lease;
  }
  return covering;
}

export function accountState(
  account: AccountTerms,
  today: IsoDate,
): AccountState {
  if (today < accountStart(account)) return "upcoming";
  const end = accountEnd(account);
  if (end !== null && end < today) return "closed";
  if (isHoldover(account, today)) return "holdover";
  return "open";
}

export function accountsOverlap(a: AccountTerms, b: AccountTerms): boolean {
  const endA = accountEnd(a);
  const endB = accountEnd(b);
  return (
    (endB === null || accountStart(a) <= endB) &&
    (endA === null || accountStart(b) <= endA)
  );
}

export function paysPool(lease: LeaseTerms, poolId: string): boolean {
  return lease.estimateSteps.some((step) => step.poolId === poolId);
}

export function isCounted(
  account: AccountTerms,
  month: YearMonth,
  trackingStart: IsoDate,
): boolean {
  const end = accountEnd(account);
  return (
    firstDay(month) >= trackingStart &&
    accountStart(account) <= lastDay(month) &&
    (end === null || end >= firstDay(month))
  );
}

export function countedMonths(
  account: AccountTerms,
  trackingStart: IsoDate,
  from: YearMonth,
  to: YearMonth,
): YearMonth[] {
  return monthsFromTo(from, to).filter((month) =>
    isCounted(account, month, trackingStart),
  );
}

export function dueDate(account: AccountTerms, month: YearMonth): IsoDate {
  return maxDate(firstDay(month), accountStart(account));
}

export function leaseForMonth(
  account: AccountTerms,
  month: YearMonth,
): LeaseTerms {
  const lease = coveringLease(account, dueDate(account, month));
  if (!lease) {
    throw new Error(`Account ${account.accountId} has no lease for ${month}`);
  }
  return lease;
}

export function stepOn<T extends { startsOn: IsoDate }>(
  steps: readonly T[],
  date: IsoDate,
): T | null {
  let found: T | null = null;
  for (const step of steps) {
    if (
      step.startsOn <= date &&
      (found === null || step.startsOn > found.startsOn)
    ) {
      found = step;
    }
  }
  return found;
}

export function rentOn(lease: LeaseTerms, date: IsoDate): number {
  const step = stepOn(lease.rentSteps, date);
  if (!step) {
    throw new Error(`Lease ${lease.leaseId} has no rent on ${date}`);
  }
  return step.amountCents;
}

export function paysOn(
  lease: LeaseTerms,
  poolId: string,
  date: IsoDate,
): boolean {
  return lease.estimateSteps.some(
    (step) => step.poolId === poolId && step.startsOn <= date,
  );
}

export function estimateOn(
  lease: LeaseTerms,
  poolId: string,
  date: IsoDate,
): number | null {
  const step = stepOn(
    lease.estimateSteps.filter((s) => s.poolId === poolId),
    date,
  );
  return step ? step.amountCents : null;
}

export interface MonthCharges {
  month: YearMonth;
  dueDate: IsoDate;
  leaseId: string;
  rentCents: number;
  estimates: { poolId: string; amountCents: number }[];
  totalCents: number;
}

export function monthCharges(
  account: AccountTerms,
  month: YearMonth,
): MonthCharges {
  const due = dueDate(account, month);
  const lease = leaseForMonth(account, month);
  const rentCents = rentOn(lease, due);
  const poolIds = [...new Set(lease.estimateSteps.map((s) => s.poolId))];
  const estimates = poolIds.flatMap((poolId) => {
    const amountCents = estimateOn(lease, poolId, due);
    return amountCents === null ? [] : [{ poolId, amountCents }];
  });
  return {
    month,
    dueDate: due,
    leaseId: lease.leaseId,
    rentCents,
    estimates,
    totalCents: estimates.reduce((sum, e) => sum + e.amountCents, rentCents),
  };
}

export function monthlyExpected(
  account: AccountTerms,
  month: YearMonth,
): number {
  return monthCharges(account, month).totalCents;
}
