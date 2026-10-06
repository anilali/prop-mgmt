"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
import { Button } from "@moonship/ui/button";
import { List, ListRow } from "@moonship/ui/list";

import { useTRPC } from "~/trpc/react";
import { formatMonthDay } from "../../_lib/format";
import { useTransactionsChanged } from "./use-transactions-changed";

type Batch = RouterOutputs["bankImport"]["listBatches"][number];

function batchSummary(batch: Batch, imported: string): string {
  const parts = [
    batch.firstPostedOn && batch.lastPostedOn
      ? `${formatMonthDay(batch.firstPostedOn)} to ${formatMonthDay(batch.lastPostedOn)}`
      : "No new dates",
    `${batch.insertedCount} ${batch.insertedCount === 1 ? "row" : "rows"}`,
    `${batch.sortedCount} sorted`,
    `imported ${imported}`,
  ];
  return parts.join(" · ");
}

export function ImportsTab() {
  const trpc = useTRPC();
  const changed = useTransactionsChanged();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: batches } = useSuspenseQuery(
    trpc.bankImport.listBatches.queryOptions(),
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  const importedFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: property.timeZone,
  });

  const remove = useMutation(
    trpc.bankImport.removeBatch.mutationOptions({
      onSuccess: async (_result, input) => {
        await changed();
        setRemovingId(null);
        const batch = batches.find((other) => other.id === input.id);
        toast.success(batch ? `Removed ${batch.fileName}` : "Import removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div className="nav:px-6 nav:pt-[22px] nav:pb-12 max-w-[880px] px-4 pt-[18px] pb-10">
      {batches.length > 0 ? (
        <List>
          {batches.map((batch, index) => {
            const confirming = removingId === batch.id;
            const locked = batch.sortedCount > 0;
            return (
              <ListRow
                key={batch.id}
                className="animate-rise group grid-cols-[28px_minmax(0,1fr)_auto] gap-2.5"
                style={{ "--i": index } as CSSProperties}
              >
                <span className="border-line-2 bg-sunk text-fg-2 grid size-7 place-items-center rounded-[7px] border">
                  <FileText className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{batch.fileName}</div>
                  <div className="text-fg-3 truncate text-xs">
                    {batchSummary(
                      batch,
                      importedFormat.format(batch.importedAt),
                    )}
                  </div>
                </div>
                {confirming ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-fg-3 text-xs max-sm:hidden">
                      Remove import?
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRemovingId(null)}
                    >
                      Keep
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ id: batch.id })}
                    >
                      Remove
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${batch.fileName}`}
                    title={
                      locked
                        ? "Can't remove: some of its transactions are sorted"
                        : "Remove import"
                    }
                    disabled={locked}
                    onClick={() => setRemovingId(batch.id)}
                    className="hover:text-red disabled:hover:text-fg-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                )}
              </ListRow>
            );
          })}
        </List>
      ) : (
        <p className="text-fg-2 text-[12.5px]">No imports yet.</p>
      )}
      <Link
        href="/transactions/import"
        className="border-line-2 text-fg-2 hover:border-accent-line hover:bg-accent-soft mt-3.5 flex items-center justify-center gap-2 rounded-[9px] border border-dashed p-3.5 transition-colors"
      >
        <Upload className="size-3.5" />
        Import bank file
        <span className="text-fg-3">CSV or QuickBooks</span>
      </Link>
    </div>
  );
}
