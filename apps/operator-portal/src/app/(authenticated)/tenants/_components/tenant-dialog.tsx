"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
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
import { Textarea } from "@moonship/ui/textarea";

import { useTRPC } from "~/trpc/react";

export type TenantView = RouterOutputs["tenant"]["list"][number];

export function TenantDialog({
  open,
  onOpenChange,
  tenant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: TenantView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tenant ? "Edit tenant" : "Add tenant"}</DialogTitle>
        </DialogHeader>
        <TenantForm tenant={tenant} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TenantForm({
  tenant,
  onDone,
}: {
  tenant: TenantView | null;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState(tenant?.businessName ?? "");
  const [contactName, setContactName] = useState(tenant?.contactName ?? "");
  const [email, setEmail] = useState(tenant?.email ?? "");
  const [phone, setPhone] = useState(tenant?.phone ?? "");
  const [notes, setNotes] = useState(tenant?.notes ?? "");
  const [street1, setStreet1] = useState(tenant?.mailingAddress?.street1 ?? "");
  const [street2, setStreet2] = useState(tenant?.mailingAddress?.street2 ?? "");
  const [city, setCity] = useState(tenant?.mailingAddress?.city ?? "");
  const [state, setState] = useState(tenant?.mailingAddress?.state ?? "");
  const [postalCode, setPostalCode] = useState(
    tenant?.mailingAddress?.postalCode ?? "",
  );
  const [country, setCountry] = useState(
    tenant?.mailingAddress?.country ?? "US",
  );

  const onSuccess = (message: string) => async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.tenant.list.queryFilter()),
      queryClient.invalidateQueries(trpc.account.pathFilter()),
    ]);
    toast.success(message);
    onDone();
  };

  const create = useMutation(
    trpc.tenant.create.mutationOptions({
      onSuccess: onSuccess("Tenant created"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const update = useMutation(
    trpc.tenant.update.mutationOptions({
      onSuccess: onSuccess("Tenant updated"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const mailingAddress = () => {
    const filled = [street1, street2, city, state, postalCode].some(
      (part) => part.trim() !== "",
    );
    if (!filled) return null;
    if (
      !street1.trim() ||
      !city.trim() ||
      !state.trim() ||
      !postalCode.trim()
    ) {
      throw new Error(
        "Enter the street, city, state, and postal code for the mailing address",
      );
    }
    if (!country.trim()) {
      throw new Error("Enter the country for the mailing address");
    }
    return {
      street1: street1.trim(),
      street2: street2.trim() || undefined,
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      country: country.trim(),
    };
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        let address: ReturnType<typeof mailingAddress>;
        try {
          address = mailingAddress();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Check the address");
          return;
        }
        if (tenant) {
          update.mutate({
            id: tenant.id,
            businessName,
            contactName: contactName || null,
            mailingAddress: address,
            email: email || null,
            phone: phone || null,
            notes: notes || null,
          });
        } else {
          create.mutate({
            businessName,
            contactName: contactName || undefined,
            mailingAddress: address ?? undefined,
            email: email || undefined,
            phone: phone || undefined,
            notes: notes || undefined,
          });
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Business name</Label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Contact name</Label>
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Mailing address</Label>
        <Input
          placeholder="Street"
          value={street1}
          onChange={(e) => setStreet1(e.target.value)}
        />
        <Input
          placeholder="Suite or unit"
          value={street2}
          onChange={(e) => setStreet2(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Input
            placeholder="State"
            value={state}
            onChange={(e) => setState(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Postal code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
          <Input
            placeholder="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

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
