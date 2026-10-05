"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { formatCents, parseCents } from "@moonship/shared";
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
import { Textarea } from "@moonship/ui/textarea";

import type { PoolView } from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import { centsToInput } from "../../../leases/_lib/format";

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
          <DialogTitle>
            {pool?.name} bill amount for {year}
          </DialogTitle>
          <DialogDescription>
            The bill amount replaces the payments sorted to this pool&apos;s
            category ({formatCents(pool?.categoryTotalCents ?? 0)}) as the{" "}
            {year} cost.
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
        toast.success(`${pool.name} bill amount cleared`);
        onDone();
      },
      onError,
    }),
  );
  const pending = save.isPending || clear.isPending;

  return (
    <form
      className="space-y-4"
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
      <div className="space-y-1">
        <Label htmlFor="bill-amount">Amount</Label>
        <Input
          id="bill-amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bill-note">Note</Label>
        <Textarea
          id="bill-note"
          value={note}
          maxLength={500}
          placeholder="Where the amount comes from, such as the county tax bill"
          onChange={(e) => setNote(e.target.value)}
          required
        />
        <p className="text-muted-foreground text-xs">
          The statement prints this note under the pool&apos;s cost.
        </p>
      </div>
      <DialogFooter className="sm:justify-between">
        {pool.billOverride ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => clear.mutate({ year, poolId: pool.poolId })}
          >
            Clear bill amount
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
