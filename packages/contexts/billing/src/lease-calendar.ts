import type { IsoDate } from "@moonship/shared";

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
