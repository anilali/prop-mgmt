"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
import type { Address } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import type { AddressDraft } from "./address-fields";
import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";
import {
  AddressFields,
  addressProblem,
  toAddress,
  toAddressDraft,
} from "./address-fields";

export type UnitView = RouterOutputs["unit"]["list"][number];

export function UnitDialog({
  open,
  onOpenChange,
  unit,
  buildingAddress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: UnitView | null;
  buildingAddress: Address;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{unit ? "Edit unit" : "Add unit"}</DialogTitle>
        </DialogHeader>
        {open ? (
          <UnitForm
            unit={unit}
            buildingAddress={buildingAddress}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UnitForm({
  unit,
  buildingAddress,
  onDone,
}: {
  unit: UnitView | null;
  buildingAddress: Address;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  const [label, setLabel] = useState(unit?.label ?? "");
  const [sqft, setSqft] = useState(unit ? String(unit.sqft) : "");
  const [address, setAddress] = useState<AddressDraft>(
    unit
      ? toAddressDraft(unit.address)
      : { ...toAddressDraft(buildingAddress), street2: "" },
  );

  const onSuccess = async (message: string) => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.unit.list.queryFilter()),
      queryClient.invalidateQueries(trpc.pool.list.queryFilter()),
      queryClient.invalidateQueries(trpc.account.pathFilter()),
      ledgerChanged(),
    ]);
    toast.success(message);
    onDone();
  };

  const create = useMutation(
    trpc.unit.create.mutationOptions({
      onSuccess: () => onSuccess("Unit added"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const update = useMutation(
    trpc.unit.update.mutationOptions({
      onSuccess: () => onSuccess("Unit saved"),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim() === "") {
          toast.error("Enter a unit label");
          return;
        }
        const sqftValue = Number(sqft);
        if (!Number.isInteger(sqftValue) || sqftValue <= 0) {
          toast.error("Sqft must be a whole number above 0");
          return;
        }
        const problem = addressProblem(address);
        if (problem) {
          toast.error(problem);
          return;
        }
        const payload = {
          label: label.trim(),
          sqft: sqftValue,
          address: toAddress(address),
        };
        if (unit) {
          update.mutate({ id: unit.id, ...payload });
        } else {
          create.mutate(payload);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="unit-label">Label</Label>
          <Input
            id="unit-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={64}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit-sqft">Sqft</Label>
          <Input
            id="unit-sqft"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            required
          />
        </div>
      </div>
      <AddressFields
        idPrefix="unit"
        value={address}
        onChange={setAddress}
        street2Label="Suite"
      />
      {unit ? null : (
        <p className="text-muted-foreground text-xs">
          New units join every pool that takes new units.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
