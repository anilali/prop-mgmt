import type { IsoDate, YearMonth } from "@moonship/shared";
import { addDays, monthOf } from "@moonship/shared";

import type { MonthCharges } from "./lease-calendar";
import type { AccountTerms, LedgerEntry, LedgerEntryKind, Txn } from "./types";
import { accountStart, countedMonths, monthCharges } from "./lease-calendar";

export interface AccountPayment {
  transactionId: string;
  postedOn: IsoDate;
  description: string;
  amountCents: number;
}

export interface AccountLedger {
  account: AccountTerms;
  trackingStart: IsoDate | null;
  payments: readonly AccountPayment[];
  entries: readonly LedgerEntry[];
}

export interface AccountBalance {
  expectedCents: number;
  receivedCents: number;
  balanceCents: number;
  lastPaymentOn: IsoDate | null;
}

export interface HistoryRowBase {
  date: IsoDate;
  amountCents: number;
  balanceCents: number;
}

export type HistoryRow =
  | (HistoryRowBase & { kind: "opening" })
  | (HistoryRowBase & {
      kind: "month";
      month: YearMonth;
      leaseId: string;
      rentCents: number;
      estimates: { poolId: string; amountCents: number }[];
    })
  | (HistoryRowBase & {
      kind: "payment";
      transactionId: string;
      description: string;
    })
  | (HistoryRowBase & {
      kind: LedgerEntryKind;
      entryId: string;
      note: string | null;
      feeMonth: YearMonth | null;
    });

export function accountPayments(
  transactions: readonly Txn[],
  accountId: string,
): AccountPayment[] {
  return transactions.flatMap((txn) =>
    txn.lines
      .filter((line) => line.accountId === accountId)
      .map((line) => ({
        transactionId: txn.id,
        postedOn: txn.postedOn,
        description: txn.description,
        amountCents: line.amountCents,
      })),
  );
}

export function accountEntries(
  entries: readonly LedgerEntry[],
  accountId: string,
): LedgerEntry[] {
  return entries.filter((entry) => entry.accountId === accountId);
}

export function monthsDue(
  account: AccountTerms,
  trackingStart: IsoDate | null,
  asOf: IsoDate,
): MonthCharges[] {
  if (trackingStart === null || asOf < trackingStart) return [];
  return countedMonths(
    account,
    trackingStart,
    monthOf(trackingStart),
    monthOf(asOf),
  )
    .map((month) => monthCharges(account, month))
    .filter((charges) => charges.dueDate <= asOf);
}

function countedPayments(
  ledger: AccountLedger,
  asOf: IsoDate,
): AccountPayment[] {
  return ledger.payments.filter(
    (payment) =>
      payment.postedOn <= asOf &&
      (ledger.trackingStart === null ||
        payment.postedOn >= ledger.trackingStart),
  );
}

function entriesThrough(ledger: AccountLedger, asOf: IsoDate): LedgerEntry[] {
  return ledger.entries.filter((entry) => entry.entryDate <= asOf);
}

function sum(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

export function expectedOn(ledger: AccountLedger, asOf: IsoDate): number {
  return (
    ledger.account.openingBalanceCents +
    sum(
      monthsDue(ledger.account, ledger.trackingStart, asOf).map(
        (charges) => charges.totalCents,
      ),
    ) +
    sum(entriesThrough(ledger, asOf).map((entry) => entry.amountCents))
  );
}

export function receivedOn(ledger: AccountLedger, asOf: IsoDate): number {
  return sum(countedPayments(ledger, asOf).map((p) => p.amountCents));
}

export function balanceOn(ledger: AccountLedger, asOf: IsoDate): number {
  return expectedOn(ledger, asOf) - receivedOn(ledger, asOf);
}

export function accountBalance(
  ledger: AccountLedger,
  asOf: IsoDate,
): AccountBalance {
  const expectedCents = expectedOn(ledger, asOf);
  const receivedCents = receivedOn(ledger, asOf);
  return {
    expectedCents,
    receivedCents,
    balanceCents: expectedCents - receivedCents,
    lastPaymentOn: lastPaymentOn(countedPayments(ledger, asOf)),
  };
}

function lastPaymentOn(payments: readonly AccountPayment[]): IsoDate | null {
  const byDate = [...payments].sort(
    (a, b) =>
      (a.postedOn < b.postedOn ? -1 : a.postedOn > b.postedOn ? 1 : 0) ||
      b.amountCents - a.amountCents,
  );
  const standing: AccountPayment[] = [];
  for (const payment of byDate) {
    if (payment.amountCents > 0) {
      standing.push(payment);
      continue;
    }
    const cancelled = standing
      .map((p) => p.amountCents)
      .lastIndexOf(-payment.amountCents);
    if (cancelled !== -1) standing.splice(cancelled, 1);
  }
  return standing.at(-1)?.postedOn ?? null;
}

const ROW_ORDER: Record<HistoryRow["kind"], number> = {
  opening: 0,
  month: 1,
  late_fee: 2,
  late_fee_dismissed: 2,
  adjustment: 2,
  true_up: 2,
  payment: 3,
};

export function historyRows(
  ledger: AccountLedger,
  through: IsoDate,
): HistoryRow[] {
  const { account, trackingStart } = ledger;
  const rows: HistoryRow[] = [];
  if (
    account.openingBalanceCents !== 0 ||
    (trackingStart !== null && accountStart(account) <= trackingStart)
  ) {
    rows.push({
      kind: "opening",
      date: addDays(trackingStart ?? accountStart(account), -1),
      amountCents: account.openingBalanceCents,
      balanceCents: 0,
    });
  }
  for (const charges of monthsDue(account, trackingStart, through)) {
    rows.push({
      kind: "month",
      date: charges.dueDate,
      month: charges.month,
      leaseId: charges.leaseId,
      rentCents: charges.rentCents,
      estimates: charges.estimates,
      amountCents: charges.totalCents,
      balanceCents: 0,
    });
  }
  for (const entry of entriesThrough(ledger, through)) {
    rows.push({
      kind: entry.kind,
      date: entry.entryDate,
      entryId: entry.id,
      note: entry.note,
      feeMonth: entry.feeMonth,
      amountCents: entry.amountCents,
      balanceCents: 0,
    });
  }
  for (const payment of countedPayments(ledger, through)) {
    rows.push({
      kind: "payment",
      date: payment.postedOn,
      transactionId: payment.transactionId,
      description: payment.description,
      amountCents: -payment.amountCents,
      balanceCents: 0,
    });
  }
  let balanceCents = 0;
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        (a.row.kind === "opening" ? -1 : 0) -
          (b.row.kind === "opening" ? -1 : 0) ||
        (a.row.date < b.row.date ? -1 : a.row.date > b.row.date ? 1 : 0) ||
        ROW_ORDER[a.row.kind] - ROW_ORDER[b.row.kind] ||
        a.index - b.index,
    )
    .map(({ row }) => {
      balanceCents += row.amountCents;
      return { ...row, balanceCents };
    });
}
