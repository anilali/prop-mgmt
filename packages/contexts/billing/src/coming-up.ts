import type { IsoDate } from "@moonship/shared";
import { addDays } from "@moonship/shared";

import type { AccountTerms, LeaseTerms, Txn } from "./types";
import {
  accountEnd,
  accountStart,
  coveringLease,
  isHoldover,
  newestLease,
  openOn,
  rentOn,
} from "./lease-calendar";

export const RENT_CHANGE_DAYS = 90;
export const INSURANCE_DAYS = 60;
export const LEASE_ENDING_DAYS = 90;

export interface RentChange {
  accountId: string;
  leaseId: string;
  stepId: string;
  startsOn: IsoDate;
  amountCents: number;
  previousAmountCents: number | null;
  tenantNotifiedAt: Date | null;
}

export type InsuranceProblem = "missing" | "expired" | "expiring";

export interface InsuranceItem {
  accountId: string;
  leaseId: string;
  insuranceExpiresOn: IsoDate | null;
  problem: InsuranceProblem;
}

export interface LeaseEndItem {
  accountId: string;
  leaseId: string;
  endDate: IsoDate;
}

export interface ComingUp {
  rentChanges: RentChange[];
  insurance: InsuranceItem[];
  leasesEnding: LeaseEndItem[];
  pastEndDate: LeaseEndItem[];
}

export function withinNextDays(
  date: IsoDate,
  today: IsoDate,
  days: number,
): boolean {
  return today <= date && date <= addDays(today, days);
}

function compareDates(a: IsoDate | null, b: IsoDate | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

function firstLease(account: AccountTerms): LeaseTerms {
  const lease = coveringLease(account, accountStart(account));
  if (!lease) throw new Error(`Account ${account.accountId} has no leases`);
  return lease;
}

function previousRent(account: AccountTerms, startsOn: IsoDate): number | null {
  const dayBefore = addDays(startsOn, -1);
  const lease = coveringLease(account, dayBefore);
  return lease ? rentOn(lease, dayBefore) : null;
}

export function rentChanges(
  accounts: readonly AccountTerms[],
  today: IsoDate,
): RentChange[] {
  return accounts
    .flatMap((account) => {
      const first = firstLease(account);
      const end = accountEnd(account);
      return account.leases.flatMap((lease) =>
        lease.rentSteps
          .filter(
            (step) =>
              !(
                lease.leaseId === first.leaseId &&
                step.startsOn === lease.startDate
              ) &&
              withinNextDays(step.startsOn, today, RENT_CHANGE_DAYS) &&
              coveringLease(account, step.startsOn)?.leaseId ===
                lease.leaseId &&
              (end === null || step.startsOn <= end),
          )
          .map((step) => ({
            accountId: account.accountId,
            leaseId: lease.leaseId,
            stepId: step.id,
            startsOn: step.startsOn,
            amountCents: step.amountCents,
            previousAmountCents: previousRent(account, step.startsOn),
            tenantNotifiedAt: step.tenantNotifiedAt,
          })),
      );
    })
    .sort((a, b) => compareDates(a.startsOn, b.startsOn));
}

function insuranceProblem(
  expiresOn: IsoDate | null,
  today: IsoDate,
): InsuranceProblem | null {
  if (expiresOn === null) return "missing";
  if (expiresOn < today) return "expired";
  if (withinNextDays(expiresOn, today, INSURANCE_DAYS)) return "expiring";
  return null;
}

export function insuranceItems(
  accounts: readonly AccountTerms[],
  today: IsoDate,
): InsuranceItem[] {
  return accounts
    .flatMap((account) => {
      let lease: LeaseTerms | null = null;
      if (openOn(account, today)) {
        lease = coveringLease(account, today);
      } else if (withinNextDays(accountStart(account), today, INSURANCE_DAYS)) {
        lease = firstLease(account);
      }
      if (!lease) return [];
      const problem = insuranceProblem(lease.insuranceExpiresOn, today);
      return problem
        ? [
            {
              accountId: account.accountId,
              leaseId: lease.leaseId,
              insuranceExpiresOn: lease.insuranceExpiresOn,
              problem,
            },
          ]
        : [];
    })
    .sort((a, b) => compareDates(a.insuranceExpiresOn, b.insuranceExpiresOn));
}

function leaseEnd(account: AccountTerms): LeaseEndItem {
  const lease = newestLease(account);
  return {
    accountId: account.accountId,
    leaseId: lease.leaseId,
    endDate: lease.endDate,
  };
}

export function leasesEnding(
  accounts: readonly AccountTerms[],
  today: IsoDate,
): LeaseEndItem[] {
  return accounts
    .filter(
      (account) =>
        accountEnd(account) === null &&
        withinNextDays(newestLease(account).endDate, today, LEASE_ENDING_DAYS),
    )
    .map(leaseEnd)
    .sort((a, b) => compareDates(a.endDate, b.endDate));
}

export function pastEndDate(
  accounts: readonly AccountTerms[],
  today: IsoDate,
): LeaseEndItem[] {
  return accounts
    .filter((account) => isHoldover(account, today))
    .map(leaseEnd)
    .sort((a, b) => compareDates(a.endDate, b.endDate));
}

export function comingUp(
  accounts: readonly AccountTerms[],
  today: IsoDate,
): ComingUp {
  return {
    rentChanges: rentChanges(accounts, today),
    insurance: insuranceItems(accounts, today),
    leasesEnding: leasesEnding(accounts, today),
    pastEndDate: pastEndDate(accounts, today),
  };
}

export function toSortCount(transactions: readonly Txn[]): number {
  return transactions.filter((txn) => txn.lines.length === 0).length;
}
