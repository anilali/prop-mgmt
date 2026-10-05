"use client";

import { useState } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@moonship/ui/button";
import { PageHeader } from "@moonship/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@moonship/ui/tabs";

import { useTRPC } from "~/trpc/react";
import { AllTab } from "./all-tab";
import { CashExpenseDialog } from "./cash-expense-dialog";
import { ToSortTab } from "./to-sort-tab";

export function TransactionsPageContent() {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: toSort } = useSuspenseQuery(
    trpc.transaction.listToSort.queryOptions(),
  );
  const [addingCash, setAddingCash] = useState(false);
  const tracking = property.trackingStartDate !== null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        description="Bank activity and cash expenses. Sort each one to an account or a category."
        action={
          <>
            <Button type="button" variant="outline" asChild>
              <Link href="/transactions/import">Import CSV</Link>
            </Button>
            <Button
              type="button"
              disabled={!tracking}
              onClick={() => setAddingCash(true)}
            >
              Add cash expense
            </Button>
          </>
        }
      />
      {tracking ? null : (
        <p className="text-muted-foreground text-sm">
          Set the tracking start date in{" "}
          <Link className="underline underline-offset-4" href="/setup">
            Setup
          </Link>{" "}
          before importing or adding cash expenses.
        </p>
      )}
      <Tabs defaultValue="to-sort">
        <TabsList>
          <TabsTrigger value="to-sort">To sort ({toSort.length})</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
        <TabsContent value="to-sort">
          <ToSortTab />
        </TabsContent>
        <TabsContent value="all">
          <AllTab />
        </TabsContent>
      </Tabs>
      <CashExpenseDialog
        expense={null}
        open={addingCash}
        onOpenChange={setAddingCash}
      />
    </div>
  );
}
