"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

import { formatPercentBps } from "@moonship/billing";
import { formatCents } from "@moonship/shared";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { StatementView, Workspace } from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import { showPdf } from "../../_lib/reconciliation";
import { formatDate } from "../../../leases/_lib/format";

function amount(cents: number | null): string {
  return cents === null ? "-" : formatCents(cents);
}

export function Statements({ workspace }: { workspace: Workspace }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Statements</h2>
        <p className="text-muted-foreground text-sm">
          One statement for each account that paid at least one pool in{" "}
          {workspace.year}, including tenants who moved out.
        </p>
      </div>
      {workspace.statements.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          No account paid a pool in {workspace.year}.
        </p>
      ) : (
        <div className="space-y-4">
          {workspace.statements.map((statement) => (
            <StatementCard
              key={statement.accountId}
              workspace={workspace}
              statement={statement}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StatementCard({
  workspace,
  statement,
}: {
  workspace: Workspace;
  statement: StatementView;
}) {
  const trpc = useTRPC();
  const preview = useMutation(trpc.reconciliation.previewPdf.mutationOptions());
  const showMonths = statement.rows.some((row) => row.months < 12);
  const continuing = statement.continuing;
  const nextYear = workspace.year + 1;

  const openPreview = () => {
    const tab = window.open("", "_blank");
    preview.mutate(
      { year: workspace.year, accountId: statement.accountId },
      {
        onSuccess: (result) => showPdf(tab, result.base64, result.fileName),
        onError: (err) => {
          tab?.close();
          toast.error(err.message);
        },
      },
    );
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 font-medium">
            <Link
              className="underline-offset-4 hover:underline"
              href={`/rent/${statement.accountId}`}
            >
              {statement.businessName}
            </Link>
            <span className="text-muted-foreground font-normal">
              Unit {statement.unitLabel}
            </span>
            {statement.holdover ? (
              <Badge variant="destructive">Past end date</Badge>
            ) : null}
            {continuing ? null : (
              <Badge variant="outline">No lease on Jan 1</Badge>
            )}
          </h3>
          <p className="text-muted-foreground text-xs">{statement.fileName}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!statement.canPreview || preview.isPending}
          title={
            statement.canPreview
              ? undefined
              : "A pool on this statement has no units"
          }
          onClick={openPreview}
        >
          <FileDown className="size-4" />
          {preview.isPending ? "Preparing PDF" : "Preview PDF"}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pool</TableHead>
            {showMonths ? (
              <TableHead className="text-right">Months</TableHead>
            ) : null}
            <TableHead className="text-right">Share</TableHead>
            <TableHead className="text-right">Their part</TableHead>
            <TableHead className="text-right">Estimates billed</TableHead>
            <TableHead className="text-right">Balance due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statement.rows.map((row) => (
            <TableRow key={row.poolId}>
              <TableCell>
                {row.name}
                {row.poolSqft > 0 && !row.unitInPool ? (
                  <Badge variant="destructive" className="ml-2">
                    Unit not in pool
                  </Badge>
                ) : null}
              </TableCell>
              {showMonths ? (
                <TableCell className="text-right tabular-nums">
                  {row.months}
                </TableCell>
              ) : null}
              {row.poolSqft > 0 ? (
                <>
                  <TableCell className="text-right tabular-nums">
                    {row.shareBps === null
                      ? "-"
                      : formatPercentBps(row.shareBps)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {amount(row.partCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(row.estimatesCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {amount(row.balanceCents)}
                  </TableCell>
                </>
              ) : (
                <TableCell
                  colSpan={4}
                  className="text-destructive text-right text-sm"
                >
                  Pool has no units
                </TableCell>
              )}
            </TableRow>
          ))}
          <TableRow className="font-medium hover:bg-transparent">
            <TableCell colSpan={showMonths ? 5 : 4}>True-up</TableCell>
            <TableCell className="border-foreground/40 border-t text-right tabular-nums">
              {amount(statement.trueUpCents)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-muted-foreground">
            {workspace.isDryRun
              ? `Rent balance as of ${formatDate(statement.priorBalanceAsOf)}`
              : "Rent balance"}
          </dt>
          <dd className="font-medium tabular-nums">
            {formatCents(statement.priorBalanceCents)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Balance on account</dt>
          <dd className="font-medium tabular-nums">
            {statement.balanceOnAccountCents === null
              ? "-"
              : formatCents(statement.balanceOnAccountCents)}
          </dd>
        </div>
      </dl>

      {continuing ? (
        <div className="bg-muted/40 space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">
            New monthly rent from {formatDate(continuing.effectiveDate)}
          </p>
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">Base rent</dt>
            <dd className="text-right tabular-nums">
              {formatCents(continuing.baseRentCents)}
            </dd>
            {continuing.newEstimates.map((estimate) => (
              <div key={estimate.poolId} className="contents">
                <dt className="text-muted-foreground">
                  {estimate.name} estimate
                </dt>
                <dd className="text-right tabular-nums">
                  {estimate.amountCents === null
                    ? "Pool has no units"
                    : formatCents(estimate.amountCents)}
                </dd>
              </div>
            ))}
            <dt className="font-medium">Total monthly rent</dt>
            <dd className="text-right font-medium tabular-nums">
              {amount(continuing.newMonthlyRentCents)}
            </dd>
          </dl>
          {continuing.insuranceRequest ? (
            <p className="text-muted-foreground">
              The letter asks for an insurance certificate for {nextYear}.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No lease covers {formatDate(`${nextYear}-01-01`)}, so the letter has
          no new rent.
        </p>
      )}

      {statement.holdover ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          This account is past its lease end date. Finalize would still give it
          the new estimates above.{" "}
          <Link
            className="underline underline-offset-4"
            href={`/leases/${statement.accountId}`}
          >
            Open the account
          </Link>
        </p>
      ) : null}
    </div>
  );
}
