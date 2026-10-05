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
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import { useTRPC } from "~/trpc/react";
import { centsToInput } from "../../_lib/format";
import { parseSignedAmount } from "../../_lib/lease-form";
import { useAccountUpdated } from "./use-account-updated";

export function OpeningBalanceDialog({
  accountId,
  openingBalanceCents,
  description,
  open,
  onOpenChange,
}: {
  accountId: string;
  openingBalanceCents: number;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opening balance</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <OpeningBalanceForm
          accountId={accountId}
          openingBalanceCents={openingBalanceCents}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function OpeningBalanceForm({
  accountId,
  openingBalanceCents,
  onDone,
}: {
  accountId: string;
  openingBalanceCents: number;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(accountId);
  const [amount, setAmount] = useState(centsToInput(openingBalanceCents));

  const save = useMutation(
    trpc.account.setOpeningBalance.mutationOptions({
      onSuccess: async (detail) => {
        await accountUpdated(detail);
        toast.success("Opening balance saved");
        onDone();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          save.mutate({
            id: accountId,
            openingBalanceCents: parseSignedAmount(amount, "opening balance"),
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Check the amount");
        }
      }}
    >
      <div className="space-y-1">
        <Label>Amount</Label>
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
