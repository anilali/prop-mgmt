"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { formatCents } from "@moonship/shared";
import { cn } from "@moonship/ui";
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

import type {
  FinalizedView as Finalized,
  Workspace,
} from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../../leases/_lib/format";
import { formatMonth } from "../../../rent/_lib/rent";

type Snapshot = Finalized["snapshots"][number];
type Comparison = Finalized["comparisons"][number];

export function FinalizedView({
  workspace,
  finalized,
}: {
  workspace: Workspace;
  finalized: Finalized;
}) {
  const mismatches = finalized.comparisons.filter((c) => !c.matches);

  return (
    <div className="space-y-8">
      {finalized.mismatchCount > 0 ? (
        <MismatchSection
          count={finalized.mismatchCount}
          mismatches={mismatches}
        />
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 text-emerald-600" />
          Current data still matches every saved statement.
        </p>
      )}
      <SnapshotsSection
        year={workspace.year}
        snapshots={finalized.snapshots}
        comparisons={finalized.comparisons}
      />
      <JanuarySection january={finalized.january} />
    </div>
  );
}

function MismatchSection({
  count,
  mismatches,
}: {
  count: number;
  mismatches: Comparison[];
}) {
  return (
    <section className="border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-4">
      <h2 className="text-destructive flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4" />
        Current data no longer matches{" "}
        {count === 1 ? "1 statement" : `${count} statements`}
      </h2>
      <p className="text-sm">
        Bank rows, sorting, or lease edits changed numbers after finalize. The
        saved PDFs are unchanged. Fix a mistake with an adjustment on the
        account.
      </p>
      <div className="space-y-3">
        {mismatches.map((comparison) => (
          <div
            key={comparison.accountId}
            className="bg-background space-y-1.5 rounded-md border p-3 text-sm"
          >
            <p className="font-medium">
              {comparison.businessName}{" "}
              <span className="text-muted-foreground font-normal">
                Unit {comparison.unitLabel}
              </span>{" "}
              <Link
                className="text-muted-foreground hover:text-foreground text-xs font-normal underline underline-offset-4"
                href={`/rent/${comparison.accountId}`}
              >
                Rent history
              </Link>
            </p>
            {comparison.hasSnapshot ? null : (
              <p className="text-muted-foreground">
                No statement was saved for this account at finalize, but it has
                one now.
              </p>
            )}
            {comparison.hasStatementNow ? null : (
              <p className="text-muted-foreground">
                This account no longer gets a statement for this year.
              </p>
            )}
            <ul className="list-disc space-y-0.5 pl-5 tabular-nums">
              {comparison.differences.map((difference, index) => (
                <li key={`${difference.label}-${index}`}>
                  {difference.message}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function SnapshotsSection({
  year,
  snapshots,
  comparisons,
}: {
  year: number;
  snapshots: Snapshot[];
  comparisons: Comparison[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Saved statements</h2>
      {snapshots.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          No statements were saved for {year}.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">True-up</TableHead>
              <TableHead className="text-right">Balance on account</TableHead>
              <TableHead className="text-right">New monthly rent</TableHead>
              <TableHead>Current data</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((snapshot) => (
              <SnapshotRow
                key={snapshot.accountId}
                year={year}
                snapshot={snapshot}
                matches={
                  comparisons.find((c) => c.accountId === snapshot.accountId)
                    ?.matches ?? true
                }
              />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function SnapshotRow({
  year,
  snapshot,
  matches,
}: {
  year: number;
  snapshot: Snapshot;
  matches: boolean;
}) {
  const trpc = useTRPC();
  const download = useMutation(
    trpc.reconciliation.downloadUrl.mutationOptions({
      onSuccess: (result) => window.location.assign(result.url),
      onError: (err) => toast.error(err.message),
    }),
  );
  const continuing = snapshot.data.continuing;

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          className="underline-offset-4 hover:underline"
          href={`/rent/${snapshot.accountId}`}
        >
          {snapshot.data.tenant.businessName}
        </Link>
      </TableCell>
      <TableCell>{snapshot.data.unit.label}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCents(snapshot.trueUpCents)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCents(snapshot.balanceOnAccountCents)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {continuing ? formatCents(continuing.newMonthlyRentCents) : "-"}
      </TableCell>
      <TableCell>
        {matches ? (
          <Badge variant="secondary">Matches</Badge>
        ) : (
          <Badge variant="destructive">Changed</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={download.isPending}
          title={snapshot.fileName}
          onClick={() =>
            download.mutate({ year, accountId: snapshot.accountId })
          }
        >
          <Download className="size-4" />
          Download PDF
        </Button>
      </TableCell>
    </TableRow>
  );
}

function JanuarySection({ january }: { january: Finalized["january"] }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{formatMonth(january.month)}</h2>
        <p className="text-muted-foreground text-sm">
          The new monthly rent for each continuing account and the payments
          dated {formatDate(january.from)} through {formatDate(january.through)}
          .
        </p>
      </div>
      {january.rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          No account continues into {formatMonth(january.month)}.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">New monthly rent</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Short</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {january.rows.map((row) => {
              const short = row.shortCents > 0;
              return (
                <TableRow
                  key={row.accountId}
                  className={cn(
                    short && "bg-destructive/5 hover:bg-destructive/10",
                  )}
                >
                  <TableCell className="font-medium">
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/rent/${row.accountId}`}
                    >
                      {row.businessName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.unitLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(row.newMonthlyRentCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(row.paidCents)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      short && "text-destructive font-medium",
                    )}
                  >
                    {short ? formatCents(row.shortCents) : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
