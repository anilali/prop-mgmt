"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
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
import { Switch } from "@moonship/ui/switch";

import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";
import { FormField } from "./form-field";

export type PoolView = RouterOutputs["pool"]["list"][number];

export function PoolDialog({
  open,
  onOpenChange,
  pool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pool: PoolView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pool ? "Rename pool" : "Add pool"}</DialogTitle>
          <DialogDescription>
            {pool
              ? "Its shared-cost category takes the new name too."
              : "Adds a shared-cost category with the same name. Check its units in the table after."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PoolForm pool={pool} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PoolForm({
  pool,
  onDone,
}: {
  pool: PoolView | null;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  const [name, setName] = useState(pool?.name ?? "");
  const [letterName, setLetterName] = useState(pool?.letterName ?? "");
  const [addsNewUnits, setAddsNewUnits] = useState(false);

  const onSuccess = async (message: string) => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.pool.list.queryFilter()),
      queryClient.invalidateQueries(trpc.category.list.queryFilter()),
      ledgerChanged(),
    ]);
    toast.success(message);
    onDone();
  };

  const create = useMutation(
    trpc.pool.create.mutationOptions({
      onSuccess: () => onSuccess("Pool added"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const update = useMutation(
    trpc.pool.update.mutationOptions({
      onSuccess: () => onSuccess("Pool saved"),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() === "") {
          toast.error("Enter a pool name");
          return;
        }
        if (letterName.trim() === "") {
          toast.error("Enter a letter name");
          return;
        }
        if (pool) {
          update.mutate({
            id: pool.id,
            name: name.trim(),
            letterName: letterName.trim(),
          });
        } else {
          create.mutate({
            name: name.trim(),
            letterName: letterName.trim(),
            unitIds: [],
            addsNewUnits,
          });
        }
      }}
    >
      <FormField label="Name" htmlFor="pool-name">
        <Input
          id="pool-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          required
        />
      </FormField>
      <FormField
        label="Letter name"
        htmlFor="pool-letter-name"
        hint={'The word letters use for this cost, as in "your tax share".'}
      >
        <Input
          id="pool-letter-name"
          value={letterName}
          onChange={(e) => setLetterName(e.target.value)}
          maxLength={64}
          placeholder="tax"
          required
        />
      </FormField>
      {pool ? null : (
        <div className="flex items-center gap-2">
          <Switch
            id="pool-adds-new-units"
            checked={addsNewUnits}
            onCheckedChange={setAddsNewUnits}
          />
          <Label htmlFor="pool-adds-new-units">
            Add new units automatically
          </Label>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={create.isPending || update.isPending}
        >
          {pool ? "Save pool" : "Add pool"}
        </Button>
      </DialogFooter>
    </form>
  );
}
