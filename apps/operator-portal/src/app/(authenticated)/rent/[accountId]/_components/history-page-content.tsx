"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { formatCents } from "@moonship/shared";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { PageHeader } from "@moonship/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { EntryRow, HistoryRow } from "../../_lib/rent";
import type { AdjustmentTarget } from "./adjustment-dialog";
import { useTRPC } from "~/trpc/react";
import { LateFeeSuggestionItem } from "../../_components/late-fee-suggestion";
import { Freshness } from "../../_components/rent-page-content";
import {
  formatMonth,
  RENT_STATUS_LABELS,
  RENT_STATUS_VARIANTS,
} from "../../_lib/rent";
import { useLedgerChanged } from "../../../_lib/use-ledger-changed";
import {
  ACCOUNT_STATE_LABELS,
  ACCOUNT_STATE_VARIANTS,
  formatDate,
} from "../../../leases/_lib/format";
import { ConfirmDialog } from "../../../setup/_components/confirm-dialog";
import { AdjustmentDialog } from "./adjustment-dialog";
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

function canRemove(row: HistoryRow): row is EntryRow {
  return (
    (row.kind === "adjustment" ||
      row.kind === "late_fee" ||
      row.kind === "late_fee_dismissed") &&
    !row.locked
  );
}

function removeText(row: EntryRow): {
  title: string;
  description: string;
  done: string;
} {
  const month = formatMonth(row.feeMonth);
  switch (row.kind) {
    case "late_fee":
      return {
        title: "Remove this late fee?",
        description: `The ${formatCents(row.amountCents)} late fee${month ? ` for ${month}` : ""} will be removed from the balance. If that month is not over, the fee is suggested again.`,
        done: "Late fee removed",
      };
    case "late_fee_dismissed":
      return {
        title: "Remove this dismissal?",
        description: `If ${month || "that month"} is not over, the late fee is suggested again.`,
        done: "Dismissal removed",
      };
    default:
      return {
        title: "Remove this adjustment?",
        description: `The ${formatCents(Math.abs(row.amountCents))} ${row.amountCents < 0 ? "credit" : "charge"} on ${formatDate(row.date)} will be removed from the balance.`,
        done: "Adjustment removed",
      };
  }
}

function RowDescription({
  row,
  onOpenPayment,
}: {
  row: HistoryRow;
  onOpenPayment: (transactionId: string) => void;
}) {
  switch (row.kind) {
    case "opening":
      return <span className="font-medium">Opening balance</span>;
    case "month":
      return (
        <>
          <span className="font-medium">
            {formatMonth(row.month)} rent
            {row.estimates.length > 0
              ? " + estimates"
              : row.fixedCharges.length > 0
                ? " + charges"
                : ""}
          </span>
          {row.estimates.length > 0 || row.fixedCharges.length > 0 ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              Rent {formatCents(row.rentCents)}
              {row.fixedCharges.map((charge) => (
                <span key={charge.name}>
                  , {charge.name} {formatCents(charge.amountCents)}
                </span>
              ))}
              {row.estimates.map((estimate) => (
                <span key={estimate.poolId}>
                  , {estimate.poolName} {formatCents(estimate.amountCents)}
                </span>
              ))}
            </p>
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
            className="text-muted-foreground hover:text-foreground block max-w-80 truncate text-left text-xs underline underline-offset-4"
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
            <p className="text-muted-foreground max-w-80 text-xs whitespace-pre-wrap">
              {row.note}
            </p>
          ) : null}
        </>
      );
  }
}

export function HistoryPageContent({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const ledgerChanged = useLedgerChanged();
  const { data } = useSuspenseQuery(
    trpc.rent.history.queryOptions({ accountId }),
  );
  const { account } = data;

  const [adjustmentTarget, setAdjustmentTarget] =
    useState<AdjustmentTarget | null>(null);
  const [entryToRemove, setEntryToRemove] = useState<EntryRow | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const removeEntry = useMutation(
    trpc.rent.removeEntry.mutationOptions({
      onSuccess: async () => {
        await ledgerChanged();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const tracking = data.trackingStart !== null;

  return (
    <div className="space-y-6">
      <Link
        href="/rent"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Rent
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {account.tenant.businessName}
            <Badge variant={ACCOUNT_STATE_VARIANTS[account.state]}>
              {ACCOUNT_STATE_LABELS[account.state]}
            </Badge>
          </span>
        }
        description={
          <>
            Unit {account.unit.label}.{" "}
            <Link
              className="underline underline-offset-4"
              href={`/leases/${account.id}`}
            >
              Leases for this account
            </Link>
          </>
        }
        action={
          <Button
            type="button"
            disabled={!tracking}
            onClick={() => setAdjustmentTarget({ mode: "add" })}
          >
            Add adjustment
          </Button>
        }
      />

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-5">
        <div className="space-y-1">
          <dt className="text-muted-foreground">Expected so far</dt>
          <dd className="font-medium tabular-nums">
            {formatCents(data.expectedCents)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Received so far</dt>
          <dd className="font-medium tabular-nums">
            {formatCents(data.receivedCents)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Balance</dt>
          <dd className="font-medium tabular-nums">
            {formatCents(data.balanceCents)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Last payment</dt>
          <dd className="font-medium">{formatDate(data.lastPaymentOn)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={RENT_STATUS_VARIANTS[data.status]}>
              {RENT_STATUS_LABELS[data.status]}
            </Badge>
          </dd>
        </div>
      </dl>

      {data.suggestions.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Late fee to decide</h2>
          {data.suggestions.map((suggestion) => (
            <LateFeeSuggestionItem
              key={suggestion.month}
              suggestion={suggestion}
            />
          ))}
        </section>
      ) : null}

      {tracking ? (
        <div className="space-y-1">
          <Freshness today={data.today} newestBankDate={data.newestBankDate} />
          <p className="text-muted-foreground text-sm">
            A positive balance is what the tenant owes.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Set the tracking start date in{" "}
          <Link className="underline underline-offset-4" href="/setup">
            Setup
          </Link>{" "}
          to see this account&apos;s history.
        </p>
      )}

      {data.rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          Nothing on this account yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row, index) => (
              <TableRow key={rowKey(row, index)}>
                <TableCell className="align-top whitespace-nowrap">
                  {formatDate(row.date)}
                </TableCell>
                <TableCell className="align-top">
                  <RowDescription row={row} onOpenPayment={setPaymentId} />
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {row.kind === "late_fee_dismissed"
                    ? ""
                    : formatCents(row.amountCents)}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {formatCents(row.balanceCents)}
                </TableCell>
                <TableCell className="text-right align-top whitespace-nowrap">
                  {canRemove(row) ? (
                    <>
                      {row.kind === "adjustment" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setAdjustmentTarget({ mode: "edit", row })
                          }
                        >
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={removeEntry.isPending}
                        onClick={() => setEntryToRemove(row)}
                      >
                        Remove
                      </Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AdjustmentDialog
        accountId={accountId}
        today={data.today}
        trackingStart={data.trackingStart}
        target={adjustmentTarget}
        onClose={() => setAdjustmentTarget(null)}
      />

      <PaymentDialog
        transactionId={paymentId}
        onClose={() => setPaymentId(null)}
      />

      <ConfirmDialog
        open={entryToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setEntryToRemove(null);
        }}
        title={entryToRemove ? removeText(entryToRemove).title : ""}
        description={entryToRemove ? removeText(entryToRemove).description : ""}
        confirmLabel="Remove"
        onConfirm={() => {
          if (!entryToRemove) return;
          const { done } = removeText(entryToRemove);
          removeEntry.mutate(
            { id: entryToRemove.entryId },
            { onSuccess: () => toast.success(done) },
          );
        }}
      />
    </div>
  );
}
