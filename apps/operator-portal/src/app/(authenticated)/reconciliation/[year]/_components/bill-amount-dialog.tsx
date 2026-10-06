"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { parseCents } from "@moonship/shared";
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
import { Money } from "@moonship/ui/money";

import type { PoolView } from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import { centsToInput } from "../../../_lib/format";

function parseAmount(text: string): number | null {
  try {
    return parseCents(text);
  } catch {
    return null;
  }
}

export function BillAmountDialog({
  year,
  pool,
  onClose,
}: {
  year: number;
  pool: PoolView | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={pool !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pool?.name} bill amount</DialogTitle>
          <DialogDescription>
            Use the year&apos;s bill when payments don&apos;t line up with the
            year, like taxes paid in halves.
          </DialogDescription>
        </DialogHeader>
        {pool ? (
          <BillAmountForm
            key={pool.poolId}
            year={year}
            pool={pool}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BillAmountForm({
  year,
  pool,
  onDone,
}: {
  year: number;
  pool: PoolView;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(
    pool.billOverride ? centsToInput(pool.billOverride.amountCents) : "",
  );
  const [note, setNote] = useState(pool.billOverride?.note ?? "");

  const refresh = () =>
    queryClient.invalidateQueries(trpc.reconciliation.pathFilter());
  const onError = (err: { message: string }) => toast.error(err.message);

  const save = useMutation(
    trpc.reconciliation.setBillOverride.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(`${pool.name} bill amount saved`);
        onDone();
      },
      onError,
    }),
  );
  const clear = useMutation(
    trpc.reconciliation.clearBillOverride.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(`${pool.name} uses payments again`);
        onDone();
      },
      onError,
    }),
  );
  const pending = save.isPending || clear.isPending;

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseAmount(amount);
        if (cents === null || cents < 0) {
          toast.error("Enter an amount of 0 or more");
          return;
        }
        const trimmed = note.trim();
        if (trimmed === "") {
          toast.error("Enter a note");
          return;
        }
        save.mutate({
          year,
          poolId: pool.poolId,
          amountCents: cents,
          note: trimmed,
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="bill-amount">{year} bill amount</Label>
        <Input
          id="bill-amount"
          inputMode="decimal"
          placeholder="0.00"
          className="font-mono"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bill-note">Note</Label>
        <Input
          id="bill-note"
          value={note}
          maxLength={500}
          placeholder="County tax bill"
          onChange={(e) => setNote(e.target.value)}
          required
        />
        <p className="text-fg-3 text-[11.5px]">
          Payments in {year}:{" "}
          <Money cents={pool.categoryTotalCents} className="text-[11.5px]" />.
          They stay listed but are not used.
        </p>
      </div>
      <DialogFooter>
        {pool.billOverride ? (
          <Button
            type="button"
            variant="destructive"
            className="sm:mr-auto"
            disabled={pending}
            onClick={() => clear.mutate({ year, poolId: pool.poolId })}
          >
            Use payments
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
