"use client";

import { useState } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
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
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import type { ListRow } from "../_lib/transactions";
import { useTRPC } from "~/trpc/react";
import {
  categoryOptions,
  categoryTarget,
  parseDollars,
  targetIds,
} from "../_lib/transactions";
import { centsToInput } from "../../leases/_lib/format";
import { ConfirmDialog } from "../../setup/_components/confirm-dialog";
import { TargetPicker } from "./target-picker";
import { useTransactionsChanged } from "./use-transactions-changed";

export function CashExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: ListRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {expense ? "Edit cash expense" : "Add cash expense"}
          </DialogTitle>
          <DialogDescription>
            Money paid outside the bank account, such as a repair paid in cash.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CashExpenseForm
            expense={expense}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CashExpenseForm({
  expense,
  onDone,
}: {
  expense: ListRow | null;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const changed = useTransactionsChanged();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: categories } = useSuspenseQuery(
    trpc.category.list.queryOptions({ includeArchived: true }),
  );
  const currentCategoryId = expense?.lines[0]?.categoryId ?? null;
  const [date, setDate] = useState(expense?.postedOn ?? property.today);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(
    expense ? centsToInput(Math.abs(expense.amountCents)) : "",
  );
  const [target, setTarget] = useState<string>(
    currentCategoryId ? categoryTarget(currentCategoryId) : "",
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const options = categoryOptions(
    categories.filter(
      (category) =>
        category.kind === "owner_expense" || category.kind === "shared_cost",
    ),
    currentCategoryId ? [currentCategoryId] : [],
  );

  const onSuccess = async (message: string) => {
    await changed();
    toast.success(message);
    onDone();
  };
  const onError = (err: { message: string }) => toast.error(err.message);

  const create = useMutation(
    trpc.transaction.createCash.mutationOptions({
      onSuccess: () => onSuccess("Cash expense added"),
      onError,
    }),
  );
  const update = useMutation(
    trpc.transaction.updateCash.mutationOptions({
      onSuccess: () => onSuccess("Cash expense saved"),
      onError,
    }),
  );
  const remove = useMutation(
    trpc.transaction.removeCash.mutationOptions({
      onSuccess: () => onSuccess("Cash expense deleted"),
      onError,
    }),
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const amountCents = parseDollars(amount);
        if (amountCents === null || amountCents <= 0) {
          toast.error("Enter an amount above 0");
          return;
        }
        if (description.trim() === "") {
          toast.error("Enter a description");
          return;
        }
        const { categoryId } = targetIds(target);
        if (!categoryId) {
          toast.error("Pick a category");
          return;
        }
        const input = {
          date,
          description: description.trim(),
          amountCents,
          categoryId,
        };
        if (expense) {
          update.mutate({ id: expense.id, ...input });
        } else {
          create.mutate(input);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cash-date">Date</Label>
          <Input
            id="cash-date"
            type="date"
            value={date}
            min={property.trackingStartDate ?? undefined}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cash-amount">Amount paid</Label>
          <Input
            id="cash-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="cash-description">Description</Label>
        <Input
          id="cash-description"
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label>Category</Label>
        <TargetPicker
          className="w-full"
          ariaLabel="Category"
          value={target}
          options={options}
          onChange={setTarget}
        />
      </div>
      <DialogFooter className="sm:justify-between">
        {expense ? (
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || update.isPending}>
            Save
          </Button>
        </div>
      </DialogFooter>
      {expense ? (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title="Delete cash expense?"
          description={`${expense.description} will be removed.`}
          confirmLabel="Delete"
          onConfirm={() => remove.mutate({ id: expense.id })}
        />
      ) : null}
    </form>
  );
}
