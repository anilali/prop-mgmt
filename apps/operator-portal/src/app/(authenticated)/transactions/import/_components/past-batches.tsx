"use client";

import { useState } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
import { Button } from "@moonship/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import { useTRPC } from "~/trpc/react";
import { useTransactionsChanged } from "../../_components/use-transactions-changed";
import { formatDate } from "../../../leases/_lib/format";
import { ConfirmDialog } from "../../../setup/_components/confirm-dialog";

type Batch = RouterOutputs["bankImport"]["listBatches"][number];

export function PastBatches() {
  const trpc = useTRPC();
  const changed = useTransactionsChanged();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: batches } = useSuspenseQuery(
    trpc.bankImport.listBatches.queryOptions(),
  );
  const [removing, setRemoving] = useState<Batch | null>(null);

  const importedAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: property.timeZone,
  });

  const remove = useMutation(
    trpc.bankImport.removeBatch.mutationOptions({
      onSuccess: async () => {
        await changed();
        toast.success("Import removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Past imports</h2>
      {batches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No imports yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Added</TableHead>
              <TableHead className="text-right">Already imported</TableHead>
              <TableHead className="text-right">Before start</TableHead>
              <TableHead className="text-right">Not transactions</TableHead>
              <TableHead className="text-right">Sorted</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell className="max-w-60 truncate font-medium">
                  {batch.fileName}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {batch.format === "ofx" ? "QuickBooks" : "CSV"}
                  {batch.accountLast4 ? (
                    <span className="text-muted-foreground block text-xs">
                      Account ending {batch.accountLast4}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {importedAt.format(batch.importedAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {batch.firstPostedOn
                    ? `${formatDate(batch.firstPostedOn)} to ${formatDate(batch.lastPostedOn)}`
                    : "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {batch.rowCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {batch.insertedCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {batch.duplicateCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {batch.beforeTrackingStartCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {batch.notTransactionCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {batch.sortedCount} of {batch.insertedCount}
                </TableCell>
                <TableCell className="text-right">
                  {batch.sortedCount === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => setRemoving(batch)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove this import?"
        description={
          removing
            ? `This deletes the ${removing.insertedCount} transactions added from ${removing.fileName}. You can import the file again afterwards.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) remove.mutate({ id: removing.id });
        }}
      />
    </section>
  );
}
