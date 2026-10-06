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
import { Textarea } from "@moonship/ui/textarea";

import type { AddressDraft } from "./address-fields";
import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";
import { addressDraft, AddressFields, toAddress } from "./address-fields";
import { FormField } from "./form-field";

export type TenantView = RouterOutputs["tenant"]["list"][number];

function useTenantUpdate(onDone: () => void, message: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  return useMutation(
    trpc.tenant.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.tenant.pathFilter()),
          queryClient.invalidateQueries(trpc.account.pathFilter()),
          ledgerChanged(),
        ]);
        toast.success(message);
        onDone();
      },
      onError: (err) => toast.error(err.message),
    }),
  );
}

function parseAddress(draft: AddressDraft) {
  try {
    return { ok: true as const, address: toAddress(draft) };
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Check the address");
    return { ok: false as const };
  }
}

export function TenantDialog({
  tenant,
  onClose,
}: {
  tenant: TenantView | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={tenant !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit tenant</DialogTitle>
        </DialogHeader>
        {tenant ? <TenantForm tenant={tenant} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TenantForm({
  tenant,
  onDone,
}: {
  tenant: TenantView;
  onDone: () => void;
}) {
  const update = useTenantUpdate(onDone, "Tenant saved");
  const [businessName, setBusinessName] = useState(tenant.businessName);
  const [contactName, setContactName] = useState(tenant.contactName ?? "");
  const [email, setEmail] = useState(tenant.email ?? "");
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [notes, setNotes] = useState(tenant.notes ?? "");
  const [address, setAddress] = useState(() =>
    addressDraft(tenant.mailingAddress),
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (businessName.trim() === "") {
          toast.error("Enter the business name");
          return;
        }
        const parsed = parseAddress(address);
        if (!parsed.ok) return;
        update.mutate({
          id: tenant.id,
          businessName: businessName.trim(),
          contactName: contactName.trim() || null,
          mailingAddress: parsed.address,
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FormField label="Business name">
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Contact name">
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </FormField>
        <FormField label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
      </div>
      <div className="flex flex-col gap-[5px]">
        <span className="text-fg-2 text-[12px] font-medium">
          Mailing address
        </span>
        <AddressFields value={address} onChange={setAddress} />
      </div>
      <FormField label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MailingAddressDialog({
  tenant,
  onClose,
}: {
  tenant: TenantView | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={tenant !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mailing address</DialogTitle>
          <DialogDescription>
            {tenant
              ? `${tenant.businessName}. Printed on each of this tenant's letters.`
              : null}
          </DialogDescription>
        </DialogHeader>
        {tenant ? (
          <MailingAddressForm tenant={tenant} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MailingAddressForm({
  tenant,
  onDone,
}: {
  tenant: TenantView;
  onDone: () => void;
}) {
  const update = useTenantUpdate(onDone, "Mailing address saved");
  const [address, setAddress] = useState(() =>
    addressDraft(tenant.mailingAddress),
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseAddress(address);
        if (!parsed.ok) return;
        update.mutate({ id: tenant.id, mailingAddress: parsed.address });
      }}
    >
      <AddressFields value={address} onChange={setAddress} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
