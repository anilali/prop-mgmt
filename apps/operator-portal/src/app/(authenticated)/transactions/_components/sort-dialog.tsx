"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatCents } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";

import type {
  AccountSummary,
  CategoryView,
  TxnLine,
} from "../_lib/transactions";
import { useTRPC } from "~/trpc/react";
import {
  amountClass,
  formatAmount,
  lineTarget,
  parseDollars,
  targetIds,
  targetOptions,
} from "../_lib/transactions";
import { centsToInput, formatDate } from "../../leases/_lib/format";
import { TargetPicker } from "./target-picker";
import { useTransactionsChanged } from "./use-transactions-changed";

export interface SortTxn {
  id: string;
  postedOn: string;
  description: string;
  amountCents: number;
}

export interface DraftLine {
  key: string;
  target: string;
  amount: string;
}

let lineCounter = 0;

export function newDraftLine(target: string, directedCents: number | null) {
  lineCounter += 1;
  return {
    key: `line-${lineCounter}`,
    target,
    amount: directedCents === null ? "" : centsToInput(directedCents),
  };
}

export function draftLinesFrom(
  amountCents: number,
  lines: readonly TxnLine[],
): DraftLine[] {
  const sign = amountCents < 0 ? -1 : 1;
  return lines.map((line) =>
    newDraftLine(lineTarget(line), line.amountCents * sign),
  );
}

export function SortDialog({
  txn,
  initialLines,
  accounts,
  categories,
  firstAccountIds,
  open,
  onOpenChange,
}: {
  txn: SortTxn | null;
  initialLines: DraftLine[];
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  firstAccountIds?: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sort transaction</DialogTitle>
          {txn ? (
            <DialogDescription>
              {formatDate(txn.postedOn)}, {txn.description},{" "}
              <span className={amountClass(txn.amountCents)}>
                {formatAmount(txn.amountCents)}
              </span>
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
  onDone,
}: {
  txn: SortTxn;
  initialLines: DraftLine[];
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  firstAccountIds: readonly string[];
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const changed = useTransactionsChanged();
  const [lines, setLines] = useState<DraftLine[]>(() =>
    initialLines.length > 0
      ? initialLines
      : [newDraftLine("", Math.abs(txn.amountCents))],
  );

  const sign = txn.amountCents < 0 ? -1 : 1;
  const total = Math.abs(txn.amountCents);
  const parsed = lines.map((line) => parseDollars(line.amount));
  const sum = parsed.reduce<number>((acc, cents) => acc + (cents ?? 0), 0);
  const remainder = total - sum;
  const keepCategoryIds = initialLines.flatMap((line) => {
    const { categoryId } = targetIds(line.target);
    return categoryId ? [categoryId] : [];
  });
  const options = targetOptions({
    amountCents: txn.amountCents,
    accounts,
    categories,
    firstAccountIds,
    keepCategoryIds,
  });

  const problem = lines.some((line) => line.target === "")
    ? "Pick an account or category on every line."
    : parsed.some((cents) => cents === null || cents === 0)
      ? "Enter an amount other than 0 on every line."
      : remainder !== 0
        ? `The lines must add up to ${formatCents(total)}.`
        : null;

  const allocate = useMutation(
    trpc.transaction.allocate.mutationOptions({
      onSuccess: async () => {
        await changed();
        toast.success("Transaction sorted");
        onDone();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) {
          toast.error(problem);
          return;
        }
        allocate.mutate({
          id: txn.id,
          lines: lines.map((line, index) => ({
            ...targetIds(line.target),
            amountCents: (parsed[index] ?? 0) * sign,
          })),
        });
      }}
    >
      <p className="text-muted-foreground text-sm">
        {txn.amountCents > 0
          ? "Amounts are money in. Enter a negative amount for a line that goes the other way."
          : "Amounts are money out. Enter a negative amount for a line that goes the other way."}
      </p>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={line.key} className="flex items-center gap-2">
            <TargetPicker
              className="min-w-0 flex-1"
              ariaLabel={`Line ${index + 1} account or category`}
              value={line.target}
              options={options}
              onChange={(target) => updateLine(line.key, { target })}
            />
            <Input
              className="w-32 text-right"
              inputMode="decimal"
              aria-label={`Line ${index + 1} amount`}
              value={line.amount}
              onChange={(e) => updateLine(line.key, { amount: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove line ${index + 1}`}
              disabled={lines.length === 1}
              onClick={() =>
                setLines((current) =>
                  current.filter((other) => other.key !== line.key),
                )
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setLines((current) => [
              ...current,
              newDraftLine("", remainder > 0 ? remainder : null),
            ])
          }
        >
          Add line
        </Button>
        <p
          className={
            remainder === 0
              ? "text-muted-foreground text-sm tabular-nums"
              : "text-destructive text-sm tabular-nums"
          }
        >
          Left to sort: {formatCents(remainder)}
        </p>
      </div>
      {problem && remainder === 0 ? (
        <p className="text-muted-foreground text-sm">{problem}</p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={problem !== null || allocate.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
