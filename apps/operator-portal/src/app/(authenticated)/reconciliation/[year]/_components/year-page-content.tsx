"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Calculator } from "lucide-react";

import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import { PageHeader } from "@moonship/ui/page-header";

import type { Workspace } from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import {
  timestampFormat,
  YEAR_STATUS_LABELS,
  YEAR_STATUS_VARIANTS,
  yearsUnavailableMessage,
} from "../../_lib/reconciliation";
import { formatDate } from "../../../leases/_lib/format";
import { Checklist } from "./checklist";
import { FinalizeSection } from "./finalize-section";
import { FinalizedView } from "./finalized-view";
import { LetterDateField } from "./letter-date-field";
import { PoolCards } from "./pool-cards";
import { Statements } from "./statements";

export function YearPageContent({ year }: { year: number }) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.reconciliation.listYears.queryOptions(),
  );
  const available = data.years.some((row) => row.year === year);

  return (
    <div className="space-y-6">
      <Link
        href="/reconciliation"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Reconciliation
      </Link>
      {available ? (
        <YearWorkspace year={year} />
      ) : (
        <EmptyState
          icon={<Calculator className="size-5" />}
          headline={`${year} cannot be reconciled`}
          description={
            yearsUnavailableMessage(data) ??
            `Choose a year from ${data.years.at(-1)?.year} to ${data.years[0]?.year}.`
          }
          action={
            <Button type="button" asChild>
              <Link href="/reconciliation">See the years</Link>
            </Button>
          }
          className="rounded-lg border border-dashed py-16"
        />
      )}
    </div>
  );
}

function YearWorkspace({ year }: { year: number }) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.reconciliation.workspace.queryOptions({ year }),
  );

  return (
    <div className="space-y-8">
      <YearHeader workspace={data} />
      {data.finalized ? (
        <FinalizedView workspace={data} finalized={data.finalized} />
      ) : (
        <>
          <Checklist year={year} items={data.checklist} />
          <PoolCards year={year} pools={data.pools} />
          <Statements workspace={data} />
          <FinalizeSection workspace={data} />
        </>
      )}
    </div>
  );
}

function YearHeader({ workspace }: { workspace: Workspace }) {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const finalizedFormat = timestampFormat(property.timeZone);

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {workspace.year} reconciliation
            <Badge variant={YEAR_STATUS_VARIANTS[workspace.status]}>
              {YEAR_STATUS_LABELS[workspace.status]}
            </Badge>
            {workspace.isDryRun ? (
              <Badge variant="outline">Dry run</Badge>
            ) : null}
          </span>
        }
        description={
          <>
            As of {formatDate(workspace.today)}.{" "}
            {workspace.newestBankDate ? (
              <>
                Bank activity imported through{" "}
                {formatDate(workspace.newestBankDate)}.
              </>
            ) : (
              <>No bank activity imported yet.</>
            )}{" "}
            {workspace.isDryRun ? (
              <>
                {workspace.year} is not over yet, so rent balances are as of
                today.
              </>
            ) : null}
          </>
        }
      />
      {workspace.finalized ? (
        <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-muted-foreground">Letter date</dt>
            <dd className="font-medium">{formatDate(workspace.letterDate)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground">Finalized</dt>
            <dd className="font-medium">
              {workspace.finalizedAt
                ? finalizedFormat.format(workspace.finalizedAt)
                : "-"}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground">Statements saved</dt>
            <dd className="font-medium">
              {workspace.finalized.snapshots.length}
            </dd>
          </div>
        </dl>
      ) : (
        <LetterDateField
          year={workspace.year}
          letterDate={workspace.letterDate}
          previewLetterDate={workspace.previewLetterDate}
        />
      )}
    </div>
  );
}
