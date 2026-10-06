"use client";

import type { ReactNode } from "react";
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
  categoryGroups,
  categoryTarget,
  parseDollars,
  targetIds,
} from "../_lib/transactions";
import { centsToInput } from "../../_lib/format";
import { ConfirmDialog } from "../../setup/_components/confirm-dialog";
import { TargetSelect } from "./split-editor";
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
            For an expense paid outside the bank account.
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

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
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

  const groups = categoryGroups({
    categories,
    amountCents: -1,
    kinds: ["owner_expense", "shared_cost"],
    keepIds: currentCategoryId ? [currentCategoryId] : [],
  });

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
      className="grid gap-3"
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="cash-date" label="Date">
          <Input
            id="cash-date"
            type="date"
            value={date}
            min={property.trackingStartDate ?? undefined}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <Field id="cash-amount" label="Amount paid">
          <Input
            id="cash-amount"
            className="font-mono"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
      </div>
      <Field id="cash-description" label="Description">
        <Input
          id="cash-description"
          placeholder="Management fee"
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </Field>
      <Field id="cash-category" label="Category">
        <TargetSelect
          id="cash-category"
          value={target}
          groups={groups}
          onChange={setTarget}
        />
      </Field>
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
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || update.isPending}
          >
            {expense ? "Save" : "Add expense"}
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
