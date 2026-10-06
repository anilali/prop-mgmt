import type { IsoDate, YearMonth } from "@moonship/shared";
import { addDays, dateInMonth, maxDate, monthOf } from "@moonship/shared";

import type { AccountLedger } from "./balance";
import { monthsDue } from "./balance";
import {
  dueDate,
  isCounted,
  leaseForMonth,
  monthlyExpected,
} from "./lease-calendar";
import { entryDateFor } from "./ledger";
import { bankReaches } from "./rent-status";

export interface LateFeeSuggestion {
  accountId: string;
  month: YearMonth;
  amountCents: number;
  feeDate: IsoDate;
}

export function lateFeeMonths(today: IsoDate): YearMonth[] {
  return [monthOf(today)];
}

export function isLateFeeDecided(
  ledger: AccountLedger,
  month: YearMonth,
): boolean {
  return ledger.entries.some(
    (entry) =>
      (entry.kind === "late_fee" || entry.kind === "late_fee_dismissed") &&
      entry.feeMonth === month,
  );
}

function sum(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

function receivedBetween(
  ledger: AccountLedger,
  trackingStart: IsoDate,
  from: IsoDate,
  to: IsoDate,
): number {
  const openingDate = addDays(trackingStart, -1);
  const openingCredit =
    from <= openingDate && openingDate <= to
      ? Math.max(0, -ledger.account.openingBalanceCents)
      : 0;
  const payments = ledger.payments
    .filter(
      (payment) =>
        payment.postedOn >= trackingStart &&
        payment.postedOn >= from &&
        payment.postedOn <= to,
    )
    .map((payment) => payment.amountCents);
  const credits = ledger.entries
    .filter(
      (entry) =>
        entry.amountCents < 0 &&
        entry.entryDate >= from &&
        entry.entryDate <= to,
    )
    .map((entry) => -entry.amountCents);
  return openingCredit + sum(payments) + sum(credits);
}

function rentOnlyBalance(
  ledger: AccountLedger,
  trackingStart: IsoDate,
  asOf: IsoDate,
): number {
  const charges = monthsDue(ledger.account, trackingStart, asOf).map(
    (month) => month.totalCents,
  );
  return (
    sum(charges) -
    receivedBetween(ledger, trackingStart, addDays(trackingStart, -1), asOf)
  );
}

export function lateFeeSuggestion(
  ledger: AccountLedger,
  month: YearMonth,
  today: IsoDate,
  newestBankDate: IsoDate | null,
): LateFeeSuggestion | null {
  const { account, trackingStart } = ledger;
  if (trackingStart === null || !isCounted(account, month, trackingStart)) {
    return null;
  }
  const lateFee = leaseForMonth(account, month).lateFee;
  if (!lateFee) return null;
  const due = dueDate(account, month);
  const feeDate = maxDate(dateInMonth(month, lateFee.day), due);
  if (monthOf(today) !== month || today <= feeDate) return null;
  if (!bankReaches(newestBankDate, feeDate)) return null;
  if (isLateFeeDecided(ledger, month)) return null;
  const carried = Math.max(
    0,
    -rentOnlyBalance(ledger, trackingStart, addDays(due, -1)),
  );
  const paidForMonth =
    carried + receivedBetween(ledger, trackingStart, due, feeDate);
  if (paidForMonth >= monthlyExpected(account, month)) return null;
  return {
    accountId: account.accountId,
    month,
    amountCents: lateFee.amountCents,
    feeDate,
  };
}

export function lateFeeSuggestions(
  ledger: AccountLedger,
  today: IsoDate,
  newestBankDate: IsoDate | null,
): LateFeeSuggestion[] {
  return lateFeeMonths(today).flatMap((month) => {
    const suggestion = lateFeeSuggestion(ledger, month, today, newestBankDate);
    return suggestion ? [suggestion] : [];
  });
}

export function lateFeeEntryDate(
  suggestion: LateFeeSuggestion,
  today: IsoDate,
  finalizedYears: readonly number[],
): { entryDate: IsoDate; movedFrom: IsoDate | null } {
  return entryDateFor(addDays(suggestion.feeDate, 1), today, finalizedYears);
}
