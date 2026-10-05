import type { IsoDate } from "@moonship/shared";
import { dateInMonth, maxDate, monthOf } from "@moonship/shared";

import type { AccountLedger } from "./balance";
import { balanceOn } from "./balance";
import {
  dueDate,
  isCounted,
  leaseForMonth,
  monthlyExpected,
} from "./lease-calendar";

export const RENT_STATUSES = ["behind", "due", "paid", "credit"] as const;

export type RentStatus = (typeof RENT_STATUSES)[number];

const DEFAULT_GRACE_DAY = 5;

export function graceDate(ledger: AccountLedger, today: IsoDate): IsoDate {
  const month = monthOf(today);
  const { account, trackingStart } = ledger;
  if (trackingStart === null || !isCounted(account, month, trackingStart)) {
    return dateInMonth(month, DEFAULT_GRACE_DAY);
  }
  const day = leaseForMonth(account, month).lateFee?.day ?? DEFAULT_GRACE_DAY;
  return maxDate(dateInMonth(month, day), dueDate(account, month));
}

export function thisMonthCharges(
  ledger: AccountLedger,
  today: IsoDate,
): number {
  const month = monthOf(today);
  const { account, trackingStart } = ledger;
  const counted =
    trackingStart !== null &&
    isCounted(account, month, trackingStart) &&
    dueDate(account, month) <= today;
  const rent = counted ? monthlyExpected(account, month) : 0;
  return ledger.entries
    .filter(
      (entry) =>
        entry.amountCents > 0 &&
        monthOf(entry.entryDate) === month &&
        entry.entryDate <= today,
    )
    .reduce((total, entry) => total + entry.amountCents, rent);
}

export function rentStatus(ledger: AccountLedger, today: IsoDate): RentStatus {
  const balance = balanceOn(ledger, today);
  if (balance < 0) return "credit";
  if (balance === 0) return "paid";
  if (
    today <= graceDate(ledger, today) &&
    balance <= thisMonthCharges(ledger, today)
  ) {
    return "due";
  }
  return "behind";
}

const STATUS_ORDER: Record<RentStatus, number> = {
  behind: 0,
  due: 1,
  paid: 2,
  credit: 2,
};

export function compareRentStatus(
  a: { status: RentStatus; balanceCents: number },
  b: { status: RentStatus; balanceCents: number },
): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    b.balanceCents - a.balanceCents
  );
}
