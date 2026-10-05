import type { IsoDate, YearMonth } from "@moonship/shared";
import { addDays, dateInMonth, maxDate, monthOf } from "@moonship/shared";

import type { AccountLedger } from "./balance";
import { balanceOn, paymentsBetween } from "./balance";
import {
  dueDate,
  isCounted,
  leaseForMonth,
  monthlyExpected,
} from "./lease-calendar";
import { entryDateFor } from "./ledger";

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

export function lateFeeSuggestion(
  ledger: AccountLedger,
  month: YearMonth,
  today: IsoDate,
): LateFeeSuggestion | null {
  const { account, trackingStart } = ledger;
  if (trackingStart === null || !isCounted(account, month, trackingStart)) {
    return null;
  }
  const lateFee = leaseForMonth(account, month).lateFee;
  if (!lateFee) return null;
  const due = dueDate(account, month);
  const feeDate = maxDate(dateInMonth(month, lateFee.day), due);
  if (today <= feeDate) return null;
  if (isLateFeeDecided(ledger, month)) return null;
  const carriedCredit = Math.max(0, -balanceOn(ledger, addDays(due, -1)));
  const paid = paymentsBetween(ledger, due, feeDate) + carriedCredit;
  if (paid >= monthlyExpected(account, month)) return null;
  if (balanceOn(ledger, today) <= 0) return null;
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
): LateFeeSuggestion[] {
  return lateFeeMonths(today).flatMap((month) => {
    const suggestion = lateFeeSuggestion(ledger, month, today);
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
