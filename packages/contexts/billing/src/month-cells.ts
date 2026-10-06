import type { IsoDate, YearMonth } from "@moonship/shared";
import { firstDay, monthOf, monthsFromTo } from "@moonship/shared";

import type { AccountLedger } from "./balance";
import { isCounted, monthlyExpected } from "./lease-calendar";
import { bankReaches, graceDate } from "./rent-status";

export const MONTH_CELL_STATES = [
  "paid",
  "short",
  "unpaid",
  "open",
  "pending",
  "nodata",
  "future",
  "off",
] as const;

export type MonthCellState = (typeof MONTH_CELL_STATES)[number];

export interface MonthCell {
  month: number;
  state: MonthCellState;
  expectedCents: number;
  paidCents: number;
}

function paidIn(
  ledger: AccountLedger,
  month: YearMonth,
  today: IsoDate,
): number {
  return ledger.payments
    .filter(
      (payment) =>
        monthOf(payment.postedOn) === month &&
        payment.postedOn <= today &&
        (ledger.trackingStart === null ||
          payment.postedOn >= ledger.trackingStart),
    )
    .reduce((total, payment) => total + payment.amountCents, 0);
}

interface CellInput {
  ledger: AccountLedger;
  month: YearMonth;
  today: IsoDate;
  newestBankDate: IsoDate | null;
  pending: boolean;
  expectedCents: number;
  paidCents: number;
}

function countedCellState(input: CellInput): MonthCellState {
  const { ledger, month, today, newestBankDate, paidCents } = input;
  const current = monthOf(today);
  if (month > current) return "future";
  if (paidCents >= input.expectedCents) return "paid";
  if (input.pending) return "pending";
  if (!bankReaches(newestBankDate, firstDay(month))) return "nodata";
  if (month === current && paidCents === 0) {
    const grace = graceDate(ledger, today);
    if (today <= grace || !bankReaches(newestBankDate, grace)) return "open";
  }
  return paidCents > 0 ? "short" : "unpaid";
}

export function monthCells(
  ledger: AccountLedger,
  today: IsoDate,
  newestBankDate: IsoDate | null,
  pendingMonths: ReadonlySet<YearMonth>,
): MonthCell[] {
  const { account, trackingStart } = ledger;
  const year = today.slice(0, 4);
  return monthsFromTo(`${year}-01`, `${year}-12`).map((month, index) => {
    const counted =
      trackingStart !== null && isCounted(account, month, trackingStart);
    const expectedCents = counted ? monthlyExpected(account, month) : 0;
    const paidCents = paidIn(ledger, month, today);
    const state = counted
      ? countedCellState({
          ledger,
          month,
          today,
          newestBankDate,
          pending: pendingMonths.has(month),
          expectedCents,
          paidCents,
        })
      : "off";
    return { month: index + 1, state, expectedCents, paidCents };
  });
}
