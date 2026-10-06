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

import { useTRPC } from "~/trpc/react";
import { FormField } from "../../_components/form-field";
import { parseSignedAmount } from "../../_lib/lease-form";
import { centsToInput } from "../../../_lib/format";
import {
  useAccountUpdated,
  useAccountUpdateFailed,
} from "../../../_lib/use-account-updated";

export function OpeningBalanceDialog({
  accountId,
  version,
  openingBalanceCents,
  description,
  open,
  onOpenChange,
}: {
  accountId: string;
  version: number;
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
          version={version}
          openingBalanceCents={openingBalanceCents}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function OpeningBalanceForm({
  accountId,
  version,
  openingBalanceCents,
  onDone,
}: {
  accountId: string;
  version: number;
  openingBalanceCents: number;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(accountId);
  const accountUpdateFailed = useAccountUpdateFailed(accountId);
  const [amount, setAmount] = useState(centsToInput(openingBalanceCents));
  const [expectedVersion] = useState(version);

  const save = useMutation(
    trpc.account.setOpeningBalance.mutationOptions({
      onSuccess: async (detail) => {
        await accountUpdated(detail);
        toast.success("Opening balance saved");
        onDone();
      },
      onError: accountUpdateFailed,
    }),
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          save.mutate({
            id: accountId,
            expectedVersion,
            openingBalanceCents: parseSignedAmount(amount, "opening balance"),
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Check the amount");
        }
      }}
    >
      <FormField label="Amount">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
