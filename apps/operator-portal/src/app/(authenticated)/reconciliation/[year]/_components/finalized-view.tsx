"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Download, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { Chip } from "@moonship/ui/chip";
import { Money } from "@moonship/ui/money";
import { StatusPill } from "@moonship/ui/status-pill";
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
import { riseStyle } from "../../_lib/reconciliation";
import { formatDate } from "../../../_lib/format";
import { formatMonth } from "../../../_lib/rent";
import { YearHeading } from "./year-heading";

type Snapshot = Finalized["snapshots"][number];
type Comparison = Finalized["comparisons"][number];

interface PoolCost {
  poolId: string;
  name: string;
  actualCents: number;
}

function savedPoolCosts(
  workspace: Workspace,
  finalized: Finalized,
): PoolCost[] {
  const saved = new Map<string, PoolCost>();
  for (const snapshot of finalized.snapshots) {
    for (const row of snapshot.data.rows) {
      if (!saved.has(row.poolId)) {
        saved.set(row.poolId, {
          poolId: row.poolId,
          name: row.name,
          actualCents: row.actualCents,
        });
      }
    }
  }
  if (saved.size === 0) {
    return workspace.pools.map((pool) => ({
      poolId: pool.poolId,
      name: pool.name,
      actualCents: pool.actualCents,
    }));
  }
  const order = workspace.pools.map((pool) => pool.poolId);
  const position = (poolId: string) => {
    const index = order.indexOf(poolId);
    return index === -1 ? order.length : index;
  };
  return [...saved.values()].sort(
    (a, b) => position(a.poolId) - position(b.poolId),
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line min-w-0 border-t px-3.5 py-3 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0">
      <div className="label-caps mb-1">{label}</div>
      <div className="font-mono text-[18px] font-medium tracking-[-0.03em]">
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <section className="animate-rise space-y-2.5" style={riseStyle(index)}>
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function FinalizedView({
  workspace,
  finalized,
}: {
  workspace: Workspace;
  finalized: Finalized;
}) {
  const pools = savedPoolCosts(workspace, finalized);
  const sharedCents = pools.reduce((sum, pool) => sum + pool.actualCents, 0);
  const mismatches = finalized.comparisons.filter((c) => !c.matches);
  const changed = new Set(mismatches.map((c) => c.accountId));

  return (
    <div className="space-y-[22px]">
      <YearHeading workspace={workspace} />
      <div
        className="border-line animate-rise grid overflow-hidden rounded-lg border sm:grid-cols-3"
        style={riseStyle(1)}
      >
        <Figure label="Letter date">{formatDate(workspace.letterDate)}</Figure>
        <Figure label="Statements saved">{finalized.snapshots.length}</Figure>
        <Figure label="Shared costs">
          <Money cents={sharedCents} />
        </Figure>
      </div>
      {mismatches.length > 0 ? (
        <MismatchSection
          count={finalized.mismatchCount}
          mismatches={mismatches}
        />
      ) : null}
      <Section title="Pool costs" index={2}>
        {pools.length === 0 ? (
          <p className="text-fg-3 text-[12.5px]">No pool costs saved.</p>
        ) : (
          <Table>
            <TableBody>
              {pools.map((pool) => (
                <TableRow key={pool.poolId}>
                  <TableCell className="font-medium">{pool.name}</TableCell>
                  <TableCell className="text-right">
                    <Money cents={pool.actualCents} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title={`Balance on account after ${workspace.year}`} index={3}>
        {finalized.snapshots.length === 0 ? (
          <p className="text-fg-3 text-[12.5px]">
            No statements were saved for {workspace.year}.
          </p>
        ) : (
          <Table>
            <TableBody>
              {finalized.snapshots.map((snapshot) => (
                <SnapshotRow
                  key={snapshot.accountId}
                  year={workspace.year}
                  snapshot={snapshot}
                  changed={changed.has(snapshot.accountId)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {finalized.january ? (
        <JanuarySection january={finalized.january} />
      ) : null}
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
    <section
      className="border-red/30 bg-red-soft animate-rise space-y-2.5 rounded-lg border p-3.5"
      style={riseStyle(2)}
    >
      <h2 className="text-red flex items-center gap-2 text-[13px] font-semibold">
        <TriangleAlert className="size-4" />
        Current data no longer matches{" "}
        {count === 1 ? "1 statement" : `${count} statements`}
      </h2>
      <p className="text-fg-2 text-[12.5px]">
        The saved PDFs are unchanged. Fix a mistake with an adjustment on the
        account.
      </p>
      <div className="space-y-2">
        {mismatches.map((comparison) => (
          <div
            key={comparison.accountId}
            className="bg-panel border-line space-y-1.5 rounded-md border p-3 text-[12.5px]"
          >
            <p className="flex items-center gap-1.5">
              <Link
                href={`/tenants/${comparison.accountId}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {comparison.businessName}
              </Link>
              <Chip>{comparison.unitLabel}</Chip>
            </p>
            {comparison.hasSnapshot ? null : (
              <p className="text-fg-2">
                No statement was saved for this account at finalize, but it has
                one now.
              </p>
            )}
            {comparison.hasStatementNow ? null : (
              <p className="text-fg-2">
                This account no longer gets a statement for this year.
              </p>
            )}
            <ul className="text-fg-2 list-disc space-y-0.5 pl-5 tabular-nums">
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

function SnapshotRow({
  year,
  snapshot,
  changed,
}: {
  year: number;
  snapshot: Snapshot;
  changed: boolean;
}) {
  const trpc = useTRPC();
  const download = useMutation(
    trpc.reconciliation.downloadUrl.mutationOptions({
      onSuccess: (result) => window.location.assign(result.url),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-1.5">
          <Link
            href={`/tenants/${snapshot.accountId}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {snapshot.data.tenant.businessName}
          </Link>
          <Chip>{snapshot.data.unit.label}</Chip>
          {changed ? <StatusPill variant="behind">Changed</StatusPill> : null}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Money cents={snapshot.balanceOnAccountCents} />
      </TableCell>
      <TableCell className="w-0 text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={download.isPending}
          title={snapshot.fileName}
          onClick={() =>
            download.mutate({ year, accountId: snapshot.accountId })
          }
        >
          <Download />
          PDF
        </Button>
      </TableCell>
    </TableRow>
  );
}

function JanuarySection({
  january,
}: {
  january: NonNullable<Finalized["january"]>;
}) {
  if (january.rows.length === 0) return null;
  return (
    <Section title={`${formatMonth(january.month)} payments`} index={4}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">New monthly rent</TableHead>
            <TableHead className="text-right">
              Paid through {formatDate(january.through)}
            </TableHead>
            <TableHead className="text-right">Short</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {january.rows.map((row) => (
            <TableRow key={row.accountId}>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <Link
                    href={`/tenants/${row.accountId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.businessName}
                  </Link>
                  <Chip>{row.unitLabel}</Chip>
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Money cents={row.newMonthlyRentCents} />
              </TableCell>
              <TableCell className="text-right">
                <Money cents={row.paidCents} />
              </TableCell>
              <TableCell className="text-right">
                {row.shortCents > 0 ? (
                  <Money cents={row.shortCents} tone="red" />
                ) : (
                  <span className="text-fg-3">None</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}
