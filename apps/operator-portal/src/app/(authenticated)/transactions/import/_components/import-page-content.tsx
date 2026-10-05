"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@moonship/ui/button";
import { PageHeader } from "@moonship/ui/page-header";
import { Separator } from "@moonship/ui/separator";

import { useTRPC } from "~/trpc/react";
import { ImportFlow } from "./import-flow";
import { PastBatches } from "./past-batches";

export function ImportPageContent() {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import bank file"
        description="Upload the bank's CSV or QuickBooks (QBO) download. Rows already imported are left out."
        action={
          <Button type="button" variant="outline" asChild>
            <Link href="/transactions">Back to transactions</Link>
          </Button>
        }
      />
      {property.trackingStartDate === null ? (
        <p className="rounded-lg border border-dashed p-6 text-sm">
          Set the tracking start date in{" "}
          <Link className="underline underline-offset-4" href="/setup">
            Setup
          </Link>{" "}
          before importing.
        </p>
      ) : (
        <ImportFlow />
      )}
      <Separator />
      <PastBatches />
    </div>
  );
}
