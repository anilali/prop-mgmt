import type { IsoDate } from "@moonship/shared";
import { isIsoDate, isYearMonth, MAX_CENTS } from "@moonship/shared";

import type { LedgerEntry } from "./types";

export class DuplicateLedgerEntryError extends Error {
  constructor(
    message = "This account already has an entry for that month or year",
  ) {
    super(message);
    this.name = "DuplicateLedgerEntryError";
  }
}

export function checkLedgerEntry(entry: LedgerEntry): void {
  if (!isIsoDate(entry.entryDate)) {
    throw new Error(`Not a date: ${entry.entryDate}`);
  }
  if (!Number.isSafeInteger(entry.amountCents)) {
    throw new Error("The amount must be a whole number of cents");
  }
  if (Math.abs(entry.amountCents) > MAX_CENTS) {
    throw new Error("The amount is too large");
  }
  const isFee =
    entry.kind === "late_fee" || entry.kind === "late_fee_dismissed";
  if (isFee !== (entry.feeMonth !== null)) {
    throw new Error("Only a late fee entry has a fee month");
  }
  if (entry.feeMonth !== null && !isYearMonth(entry.feeMonth)) {
    throw new Error(`Not a month: ${entry.feeMonth}`);
  }
  if ((entry.kind === "true_up") !== (entry.reconciliationYearId !== null)) {
    throw new Error("Only a true-up entry belongs to a reconciliation year");
  }
  switch (entry.kind) {
    case "late_fee":
      if (entry.amountCents <= 0) {
        throw new Error("A late fee must be more than 0");
      }
      return;
    case "late_fee_dismissed":
      if (entry.amountCents !== 0) {
        throw new Error("A dismissed late fee has no amount");
      }
      return;
    case "adjustment":
      if (entry.amountCents === 0) {
        throw new Error("An adjustment needs an amount other than 0");
      }
      if (!entry.note?.trim()) {
        throw new Error("An adjustment needs a note");
      }
      return;
    case "true_up":
      if (entry.amountCents === 0) {
        throw new Error("A true-up needs an amount other than 0");
      }
      return;
  }
}

export function isInFinalizedYear(
  date: IsoDate,
  finalizedYears: readonly number[],
): boolean {
  if (finalizedYears.length === 0) return false;
  return date <= `${Math.max(...finalizedYears)}-12-31`;
}

export function entryDateFor(
  requested: IsoDate,
  today: IsoDate,
  finalizedYears: readonly number[],
): { entryDate: IsoDate; movedFrom: IsoDate | null } {
  return isInFinalizedYear(requested, finalizedYears)
    ? { entryDate: today, movedFrom: requested }
    : { entryDate: requested, movedFrom: null };
}
