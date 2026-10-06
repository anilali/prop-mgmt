"use client";

import Link from "next/link";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Calculator, ChevronRight } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import { List, ListRow } from "@moonship/ui/list";
import { StatusPill } from "@moonship/ui/status-pill";

import type { Workspace, YearRow } from "../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import {
  blockerCount,
  plural,
  riseStyle,
  YEAR_STATUS_LABELS,
  YEAR_STATUS_VARIANTS,
  yearsUnavailableMessage,
} from "../_lib/reconciliation";
import { formatDate } from "../../_lib/format";

const ROW_COLUMNS =
  "nav:grid-cols-[90px_150px_minmax(0,1fr)_auto] grid-cols-[70px_minmax(0,1fr)_auto]";

export function YearsPageContent() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.reconciliation.listYears.queryOptions(),
  );
  const unavailable = yearsUnavailableMessage(data);

  if (unavailable) {
    return (
      <EmptyState
        icon={<Calculator className="size-5" />}
        headline="No year to reconcile yet"
        description={unavailable}
        action={
          data.trackingStart === null ? (
            <Button type="button" variant="outline" asChild>
              <Link href="/setup?tab=property">Open Setup</Link>
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <List>
      {data.years.map((row, index) => (
        <YearListRow key={row.year} row={row} index={index} />
      ))}
    </List>
  );
}

function YearListRow({ row, index }: { row: YearRow; index: number }) {
  const trpc = useTRPC();
  const { data: workspace } = useQuery(
    trpc.reconciliation.workspace.queryOptions({ year: row.year }),
  );

  return (
    <ListRow
      asChild
      className={`${ROW_COLUMNS} animate-rise py-3.5`}
      style={riseStyle(index)}
    >
      <Link href={`/reconciliation/${row.year}`}>
        <span className="font-mono text-[18px] font-medium tracking-[-0.03em]">
          {row.year}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill variant={YEAR_STATUS_VARIANTS[row.status]}>
            {YEAR_STATUS_LABELS[row.status]}
          </StatusPill>
          {row.status === "draft" && workspace?.isDryRun ? (
            <StatusPill variant="plain">Dry run</StatusPill>
          ) : null}
        </span>
        <span className="text-fg-3 max-nav:hidden truncate text-[11.5px]">
          {workspace ? yearSummary(row, workspace) : null}
        </span>
        <ChevronRight className="text-fg-3 size-4" />
      </Link>
    </ListRow>
  );
}

function yearSummary(row: YearRow, workspace: Workspace): string {
  if (row.status === "finalized") {
    const saved = plural(
      workspace.finalized?.snapshots.length ?? 0,
      "statement",
      "statements",
    );
    return `Letters dated ${formatDate(row.letterDate)} · ${saved} saved`;
  }
  const blockers = blockerCount(workspace);
  return blockers === 0
    ? "Nothing blocks finalizing"
    : `${plural(blockers, "item blocks", "items block")} finalizing`;
}
