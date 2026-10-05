"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";

import type {
  AccountDetail,
  Lease,
  LeaseFormState,
  PoolOption,
} from "../../_lib/lease-form";
import { useTRPC } from "~/trpc/react";
import { LeaseFormFields } from "../../_components/lease-form-fields";
import { toLeaseInput } from "../../_lib/lease-form";
import { useAccountUpdated } from "./use-account-updated";

export type LeaseDialogTarget =
  | { mode: "add"; initial: LeaseFormState }
  | { mode: "edit"; lease: Lease; initial: LeaseFormState; isNewest: boolean };

export function LeaseDialog({
  accountId,
  version,
  target,
  pools,
  onClose,
}: {
  accountId: string;
  version: number;
  target: LeaseDialogTarget | null;
  pools: readonly PoolOption[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {target?.mode === "edit" ? "Edit lease" : "Add lease"}
          </DialogTitle>
        </DialogHeader>
        {target ? (
          <LeaseForm
            accountId={accountId}
            version={version}
            target={target}
            pools={pools}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LeaseForm({
  accountId,
  version,
  target,
  pools,
  onDone,
}: {
  accountId: string;
  version: number;
  target: LeaseDialogTarget;
  pools: readonly PoolOption[];
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(accountId);
  const [form, setForm] = useState(target.initial);
  const [expectedVersion] = useState(version);

  const onSuccess = (message: string) => async (detail: AccountDetail) => {
    await accountUpdated(detail);
    toast.success(message);
    onDone();
  };

  const add = useMutation(
    trpc.lease.add.mutationOptions({
      onSuccess: onSuccess("Lease added"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const update = useMutation(
    trpc.lease.update.mutationOptions({
      onSuccess: onSuccess("Lease updated"),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const lease = toLeaseInput(form, pools);
          if (target.mode === "edit") {
            update.mutate({
              accountId,
              expectedVersion,
              leaseId: target.lease.id,
              lease,
            });
          } else {
            add.mutate({ accountId, expectedVersion, lease });
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Check the form");
        }
      }}
    >
      <LeaseFormFields
        value={form}
        onChange={setForm}
        pools={pools}
        showMoveOut={target.mode === "add" || target.isNewest}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={add.isPending || update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
