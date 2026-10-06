"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { formatMoney, Money } from "@moonship/ui/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { EntryRow, HistoryRow, RentHistory } from "../../../_lib/rent";
import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../../_lib/format";
import { formatMonth } from "../../../_lib/rent";
import { useLedgerChanged } from "../../../_lib/use-ledger-changed";
import { PaymentDialog } from "./payment-dialog";

function rowKey(row: HistoryRow, index: number): string {
  switch (row.kind) {
    case "opening":
      return "opening";
    case "month":
      return `month-${row.month}-${row.leaseId}`;
    case "payment":
      return `payment-${row.transactionId}-${index}`;
    default:
      return `entry-${row.entryId}`;
  }
}

function entryTitle(row: EntryRow): string {
  const month = formatMonth(row.feeMonth);
  switch (row.kind) {
    case "adjustment":
      return row.amountCents < 0 ? "Credit" : "Charge";
    case "late_fee":
      return month ? `Late fee for ${month}` : "Late fee";
    case "late_fee_dismissed":
      return month ? `Late fee for ${month} dismissed` : "Late fee dismissed";
    case "true_up":
      return "True-up";
  }
}

function removable(row: HistoryRow): row is EntryRow {
  return (
    (row.kind === "adjustment" ||
      row.kind === "late_fee" ||
      row.kind === "late_fee_dismissed") &&
    !row.locked
  );
}

function removedText(row: EntryRow): string {
  switch (row.kind) {
    case "late_fee":
      return "Late fee removed";
    case "late_fee_dismissed":
      return "Dismissal removed";
    default:
      return "Adjustment removed";
  }
}

function removeHint(row: EntryRow): string {
  switch (row.kind) {
    case "late_fee":
    case "late_fee_dismissed":
      return "If that month is not over, the late fee is suggested again.";
    default:
      return "Remove adjustment";
  }
}

function monthDetail(row: Extract<HistoryRow, { kind: "month" }>): string {
  const parts = [`base ${formatMoney(row.rentCents)}`];
  for (const estimate of row.estimates) {
    parts.push(`${estimate.poolName} ${formatMoney(estimate.amountCents)}`);
  }
  for (const charge of row.fixedCharges) {
    parts.push(
      `${charge.name.toLowerCase()} ${formatMoney(charge.amountCents)}`,
    );
  }
  return parts.join(" + ");
}

function Entry({
  row,
  onOpenPayment,
}: {
  row: HistoryRow;
  onOpenPayment: (transactionId: string) => void;
}) {
  const detail = "text-fg-3 block max-w-96 text-[11.5px]";
  switch (row.kind) {
    case "opening":
      return <span className="font-medium">Opening balance</span>;
    case "month":
      return (
        <>
          <span className="font-medium">{formatMonth(row.month)} rent</span>
          {row.estimates.length > 0 || row.fixedCharges.length > 0 ? (
            <span className={detail}>{monthDetail(row)}</span>
          ) : null}
        </>
      );
    case "payment":
      return (
        <>
          <span className="font-medium">
            {row.amountCents > 0 ? "Returned payment" : "Payment"}
          </span>
          <button
            type="button"
            className={`${detail} hover:text-foreground cursor-pointer truncate text-left underline decoration-[var(--line-3)] underline-offset-[3px]`}
            title={row.description}
            onClick={() => onOpenPayment(row.transactionId)}
          >
            {row.description}
          </button>
        </>
      );
    default:
      return (
        <>
          <span className="font-medium">{entryTitle(row)}</span>
          {row.note ? (
            <span className={`${detail} whitespace-pre-wrap`}>{row.note}</span>
          ) : null}
        </>
      );
  }
}

export function ActivityTab({
  data,
  onEditAdjustment,
}: {
  data: RentHistory;
  onEditAdjustment: (row: EntryRow) => void;
}) {
  const trpc = useTRPC();
  const ledgerChanged = useLedgerChanged();
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const removeEntry = useMutation(
    trpc.rent.removeEntry.mutationOptions({
      onSuccess: async () => {
        await ledgerChanged();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const rows = data.rows
    .map((row, index) => ({ row, key: rowKey(row, index) }))
    .reverse();

  if (data.trackingStart === null) {
    return (
      <p className="text-fg-2 border-line-2 rounded-[10px] border border-dashed px-5 py-10 text-center text-[12.5px]">
        Set the tracking start date in Setup to see this account&apos;s
        activity.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-fg-2 border-line-2 rounded-[10px] border border-dashed px-5 py-10 text-center text-[12.5px]">
        Nothing on this account yet.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ row, key }) => (
            <TableRow key={key} className="group">
              <TableCell className="text-fg-3 align-top font-mono text-[12px] whitespace-nowrap">
                {formatDate(row.date)}
              </TableCell>
              <TableCell className="align-top">
                <Entry row={row} onOpenPayment={setPaymentId} />
              </TableCell>
              <TableCell className="text-right align-top">
                {row.kind === "late_fee_dismissed" ? null : (
                  <Money
                    cents={row.amountCents}
                    sign
                    className={row.amountCents < 0 ? "text-green" : undefined}
                  />
                )}
              </TableCell>
              <TableCell className="text-right align-top">
                <Money cents={row.balanceCents} />
              </TableCell>
              <TableCell className="py-1.5 text-right align-top whitespace-nowrap">
                {removable(row) ? (
                  confirming === row.entryId ? (
                    <span className="flex items-center justify-end gap-1.5">
                      <span className="text-fg-3 text-[11.5px]">Remove?</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirming(null)}
                      >
                        Keep
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={removeEntry.isPending}
                        onClick={() =>
                          removeEntry.mutate(
                            { id: row.entryId },
                            {
                              onSuccess: () => {
                                setConfirming(null);
                                toast.success(removedText(row));
                              },
                            },
                          )
                        }
                      >
                        Remove
                      </Button>
                    </span>
                  ) : (
                    <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                      {row.kind === "adjustment" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Edit adjustment"
                          title="Edit adjustment"
                          onClick={() => onEditAdjustment(row)}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove"
                        title={removeHint(row)}
                        className="hover:text-red"
                        onClick={() => setConfirming(row.entryId)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  )
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaymentDialog
        transactionId={paymentId}
        onClose={() => setPaymentId(null)}
      />
    </>
  );
}
