"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type {
  AccountSummary,
  CategoryView,
  ToSortRow,
} from "../_lib/transactions";
import type { DraftLine } from "./sort-dialog";
import { useTRPC } from "~/trpc/react";
import {
  accountLabel,
  amountClass,
  directionLabel,
  formatAmount,
  suggestedTarget,
  targetIds,
  targetOptions,
} from "../_lib/transactions";
import { formatDate } from "../../leases/_lib/format";
import { newDraftLine, SortDialog } from "./sort-dialog";
import { TargetPicker } from "./target-picker";
import { useTransactionsChanged } from "./use-transactions-changed";

function choiceIds(row: ToSortRow): string[] {
  return row.suggestion.kind === "accountChoices"
    ? row.suggestion.accountIds
    : [];
}

export function ToSortTab() {
  const trpc = useTRPC();
  const { data: rows } = useSuspenseQuery(
    trpc.transaction.listToSort.queryOptions(),
  );
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );
  const { data: categories } = useSuspenseQuery(
    trpc.category.list.queryOptions({ includeArchived: true }),
  );
  const [splitting, setSplitting] = useState<{
    row: ToSortRow;
    lines: DraftLine[];
  } | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-5" />}
        headline="Nothing to sort"
        description="New bank transactions show up here after an import."
        className="rounded-lg border border-dashed py-16"
      />
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Sort to</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ToSortTableRow
              key={row.id}
              row={row}
              accounts={accountList.accounts}
              categories={categories}
              onSplit={(target) =>
                setSplitting({
                  row,
                  lines: [
                    newDraftLine(target, Math.abs(row.amountCents)),
                    newDraftLine("", null),
                  ],
                })
              }
            />
          ))}
        </TableBody>
      </Table>
      <SortDialog
        txn={splitting?.row ?? null}
        initialLines={splitting?.lines ?? []}
        accounts={accountList.accounts}
        categories={categories}
        firstAccountIds={splitting ? choiceIds(splitting.row) : []}
        open={splitting !== null}
        onOpenChange={(open) => {
          if (!open) setSplitting(null);
        }}
      />
    </>
  );
}

function ToSortTableRow({
  row,
  accounts,
  categories,
  onSplit,
}: {
  row: ToSortRow;
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  onSplit: (target: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const changed = useTransactionsChanged();
  const [target, setTarget] = useState<string>(suggestedTarget(row.suggestion));
  const choices = choiceIds(row);
  const options = targetOptions({
    amountCents: row.amountCents,
    accounts,
    categories,
    firstAccountIds: choices,
  });
  const choiceNames = choices.flatMap((id) => {
    const account = accounts.find((a) => a.id === id);
    return account ? [accountLabel(account)] : [];
  });

  const listKey = trpc.transaction.listToSort.queryKey();
  const confirm = useMutation(
    trpc.transaction.allocate.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey: listKey });
        queryClient.setQueryData(listKey, (current) =>
          current?.filter((other) => other.id !== row.id),
        );
      },
      onSuccess: () => toast.success("Transaction sorted"),
      onError: (err) => toast.error(err.message),
      onSettled: () => changed(),
    }),
  );

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {formatDate(row.postedOn)}
      </TableCell>
      <TableCell className="max-w-80">
        <div className="truncate" title={row.description}>
          {row.description}
        </div>
        {choiceNames.length > 1 ? (
          <p className="text-muted-foreground text-xs">
            Matches the expected rent of {choiceNames.join(" and ")}. Pick one,
            or split.
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Badge variant="outline" className="mr-2">
          {directionLabel(row.amountCents)}
        </Badge>
        <span className={amountClass(row.amountCents)}>
          {formatAmount(row.amountCents)}
        </span>
      </TableCell>
      <TableCell className="w-80">
        <TargetPicker
          className="w-80"
          ariaLabel={`Sort ${row.description}`}
          value={target}
          options={options}
          onChange={setTarget}
        />
      </TableCell>
      <TableCell className="space-x-2 text-right whitespace-nowrap">
        <Button
          type="button"
          size="sm"
          disabled={target === "" || confirm.isPending}
          onClick={() =>
            confirm.mutate({
              id: row.id,
              lines: [{ ...targetIds(target), amountCents: row.amountCents }],
            })
          }
        >
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onSplit(target)}
        >
          Split
        </Button>
      </TableCell>
    </TableRow>
  );
}
