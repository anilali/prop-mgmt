"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Calculator, Check } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@moonship/ui/tabs";

import type { Workspace, YearRow } from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import {
  blockerCount,
  parseYearTab,
  yearsUnavailableMessage,
} from "../../_lib/reconciliation";
import { BillAmountDialog } from "./bill-amount-dialog";
import { Checklist } from "./checklist";
import { FinalizeSection } from "./finalize-section";
import { FinalizedView } from "./finalized-view";
import { LetterDateField } from "./letter-date-field";
import { PoolCards } from "./pool-cards";
import { Statements } from "./statements";
import { YearHeading } from "./year-heading";

const PAGE = "nav:px-6 nav:pt-[22px] nav:pb-12 px-4 pt-[18px] pb-10";

export function YearPageContent({ year }: { year: number }) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.reconciliation.listYears.queryOptions(),
  );
  const available = data.years.some((row) => row.year === year);

  if (!available) {
    return (
      <div className={PAGE}>
        <EmptyState
          icon={<Calculator className="size-5" />}
          headline={`${year} cannot be reconciled`}
          description={
            yearsUnavailableMessage(data) ??
            `Choose a year from ${data.years.at(-1)?.year} to ${data.years[0]?.year}.`
          }
          action={
            <Button type="button" variant="outline" asChild>
              <Link href="/reconciliation">See the years</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <YearWorkspace year={year} years={data.years} />;
}

function YearWorkspace({ year, years }: { year: number; years: YearRow[] }) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.reconciliation.workspace.queryOptions({ year }),
  );

  if (data.finalized) {
    return (
      <div className={`${PAGE} max-w-[880px]`}>
        <FinalizedView workspace={data} finalized={data.finalized} />
      </div>
    );
  }
  return <OpenYear workspace={data} years={years} />;
}

function OpenYear({
  workspace,
  years,
}: {
  workspace: Workspace;
  years: YearRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseYearTab(searchParams.get("tab"));
  const [billPoolId, setBillPoolId] = useState<string | null>(null);
  const billPool =
    workspace.pools.find((pool) => pool.poolId === billPoolId) ?? null;
  const blockers = blockerCount(workspace);

  return (
    <>
      <div className="nav:px-6 nav:pt-[22px] px-4 pt-[18px] pb-2.5">
        <YearHeading workspace={workspace} />
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          router.replace(`${pathname}?tab=${parseYearTab(value)}`, {
            scroll: false,
          })
        }
        className="gap-0"
      >
        <TabsList className="nav:px-[18px] px-2.5">
          <TabsTrigger value="checklist">
            Checklist
            {blockers > 0 ? (
              <TabsCount hot>{blockers}</TabsCount>
            ) : (
              <TabsCount>
                <Check className="size-3" aria-label="Nothing blocks" />
              </TabsCount>
            )}
          </TabsTrigger>
          <TabsTrigger value="pools">
            Pool costs
            <TabsCount>{workspace.pools.length}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="letters">
            Letters
            <TabsCount>{workspace.statements.length}</TabsCount>
          </TabsTrigger>
        </TabsList>
        <div className={`${PAGE} max-w-[1180px]`}>
          <TabsContent value="checklist">
            <Checklist
              workspace={workspace}
              years={years}
              onEnterBill={setBillPoolId}
            />
          </TabsContent>
          <TabsContent value="pools">
            <PoolCards workspace={workspace} onEditBill={setBillPoolId} />
          </TabsContent>
          <TabsContent value="letters" className="grid gap-[22px]">
            <LetterDateField
              year={workspace.year}
              letterDate={workspace.letterDate}
            />
            <Statements workspace={workspace} />
            <FinalizeSection workspace={workspace} />
          </TabsContent>
        </div>
      </Tabs>
      <BillAmountDialog
        year={workspace.year}
        pool={billPool}
        onClose={() => setBillPoolId(null)}
      />
    </>
  );
}
