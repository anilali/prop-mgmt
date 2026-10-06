"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";

import type { DraftLine } from "../_lib/draft";
import type { AccountSummary, CategoryView } from "../_lib/transactions";
import { useTRPC } from "~/trpc/react";
import { allocationLines, draftProblem, newDraftLine } from "../_lib/draft";
import { targetGroups, targetIds } from "../_lib/transactions";
import { formatDate } from "../../_lib/format";
import { Amount } from "./amount";
import { SplitEditor } from "./split-editor";
import { useTransactionsChanged } from "./use-transactions-changed";

export type { DraftLine } from "../_lib/draft";
export { draftLinesFrom, newDraftLine } from "../_lib/draft";

export interface SortTxn {
  id: string;
  postedOn: string;
  description: string;
  amountCents: number;
}

export function SortDialog({
  txn,
  initialLines,
  accounts,
  categories,
  firstAccountIds,
  sorted,
  open,
  onOpenChange,
}: {
  txn: SortTxn | null;
  initialLines: DraftLine[];
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  firstAccountIds?: readonly string[];
  sorted?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isSorted = sorted ?? initialLines.length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isSorted ? "Change sorting" : "Sort transaction"}
          </DialogTitle>
          {txn ? (
            <DialogDescription>
              {formatDate(txn.postedOn)} · {txn.description} ·{" "}
              <Amount cents={txn.amountCents} />
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {open && txn ? (
          <SortForm
            txn={txn}
            initialLines={initialLines}
            accounts={accounts}
            categories={categories}
            firstAccountIds={firstAccountIds ?? []}
            canUnsort={sorted === true}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SortForm({
  txn,
  initialLines,
  accounts,
  categories,
  firstAccountIds,
  canUnsort,
  onDone,
}: {
  txn: SortTxn;
  initialLines: DraftLine[];
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  firstAccountIds: readonly string[];
  canUnsort: boolean;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const changed = useTransactionsChanged();
  const [lines, setLines] = useState<DraftLine[]>(() =>
    initialLines.length > 0
      ? initialLines
      : [newDraftLine("", Math.abs(txn.amountCents))],
  );

  const keepCategoryIds = initialLines.flatMap((line) => {
    const { categoryId } = targetIds(line.target);
    return categoryId ? [categoryId] : [];
  });
  const groups = targetGroups({
    amountCents: txn.amountCents,
    accounts,
    categories,
    firstAccountIds,
    keepCategoryIds,
  });
  const problem = draftProblem(txn.amountCents, lines, true);

  const allocate = useMutation(
    trpc.transaction.allocate.mutationOptions({
      onSuccess: async () => {
        await changed();
        toast.success("Sorting saved");
        onDone();
      },
      onError: (err) => toast.error(err.message),
    }),
  );
  const unsort = useMutation(
    trpc.transaction.unsort.mutationOptions({
      onSuccess: async () => {
        await changed();
        toast.success("Moved back to To sort");
        onDone();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="grid gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        allocate.mutate({
          id: txn.id,
          lines: allocationLines(txn.amountCents, lines),
        });
      }}
    >
      <SplitEditor
        amountCents={txn.amountCents}
        lines={lines}
        groups={groups}
        onChange={setLines}
      />
      {problem ? <p className="text-fg-3 text-xs">{problem}</p> : null}
      <DialogFooter className={canUnsort ? "sm:justify-between" : undefined}>
        {canUnsort ? (
          <Button
            type="button"
            variant="ghost"
            disabled={unsort.isPending}
            onClick={() => unsort.mutate({ id: txn.id })}
          >
            Move back to To sort
          </Button>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={problem !== null || allocate.isPending}
          >
            Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
