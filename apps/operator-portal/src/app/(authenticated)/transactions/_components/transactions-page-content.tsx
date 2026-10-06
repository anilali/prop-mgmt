"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Banknote, Upload } from "lucide-react";

import { Button } from "@moonship/ui/button";
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@moonship/ui/tabs";

import { useTRPC } from "~/trpc/react";
import { PageTopBar } from "../../_components/page-top-bar";
import { AllTab } from "./all-tab";
import { CashExpenseDialog } from "./cash-expense-dialog";
import { ImportsTab } from "./imports-tab";
import { ToSortTab } from "./to-sort-tab";

const TABS = ["sort", "all", "imports"] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab === value);
}

export function TransactionsPageContent() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: toSort } = useSuspenseQuery(
    trpc.transaction.listToSort.queryOptions(),
  );
  const { data: all } = useSuspenseQuery(trpc.transaction.list.queryOptions());
  const [addingCash, setAddingCash] = useState(false);
  const tracking = property.trackingStartDate !== null;

  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "sort";
  const cashOpen =
    tracking && (addingCash || searchParams.get("add") === "cash");

  const replaceParams = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  return (
    <>
      <PageTopBar
        crumbs={[{ label: "Transactions" }]}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="max-nav:hidden"
              disabled={!tracking}
              title={
                tracking
                  ? undefined
                  : "Set the tracking start date in Setup first"
              }
              onClick={() => setAddingCash(true)}
            >
              <Banknote />
              Add cash expense
            </Button>
            <Button variant="outline" asChild>
              <Link href="/transactions/import">
                <Upload />
                Import bank file
              </Link>
            </Button>
          </>
        }
      />
      {tracking ? null : (
        <p className="border-line text-fg-2 nav:px-6 border-b px-4 py-2.5 text-[12.5px]">
          Set the tracking start date in{" "}
          <Link
            className="text-primary font-medium hover:underline"
            href="/setup"
          >
            Setup
          </Link>{" "}
          before importing or adding cash expenses.
        </p>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (!isTab(value)) return;
          replaceParams((params) => {
            if (value === "sort") params.delete("tab");
            else params.set("tab", value);
          });
        }}
        className="gap-0"
      >
        <TabsList className="nav:px-[18px] px-2.5">
          <TabsTrigger value="sort">
            To sort{" "}
            <TabsCount hot={toSort.length > 0}>{toSort.length}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="all">
            All <TabsCount>{all.rows.length}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="imports">Imports</TabsTrigger>
        </TabsList>
        <TabsContent value="sort">
          <ToSortTab history={all.rows} />
        </TabsContent>
        <TabsContent value="all">
          <AllTab rows={all.rows} />
        </TabsContent>
        <TabsContent value="imports">
          <ImportsTab />
        </TabsContent>
      </Tabs>
      <CashExpenseDialog
        expense={null}
        open={cashOpen}
        onOpenChange={(open) => {
          setAddingCash(open);
          if (!open && searchParams.get("add") !== null) {
            replaceParams((params) => params.delete("add"));
          }
        }}
      />
    </>
  );
}
