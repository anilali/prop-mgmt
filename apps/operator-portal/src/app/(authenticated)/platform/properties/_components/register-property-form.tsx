"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { DialogFooter } from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import type { AddressDraft } from "../../../setup/_components/address-fields";
import { useTRPC } from "~/trpc/react";
import {
  AddressFields,
  addressProblem,
  toAddress,
} from "../../../setup/_components/address-fields";

const EMPTY_ADDRESS: AddressDraft = {
  street1: "",
  street2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
};

export function RegisterPropertyForm({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState<AddressDraft>(EMPTY_ADDRESS);

  const register = useMutation(
    trpc.property.register.mutationOptions({
      onSuccess: async (property) => {
        await queryClient.invalidateQueries(trpc.property.list.queryFilter());
        toast.success("Property registered");
        onDone();
        router.push(`/platform/properties/${property.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() === "") {
          toast.error("Enter the property name");
          return;
        }
        const problem = addressProblem(address);
        if (problem) {
          toast.error(problem);
          return;
        }
        register.mutate({ name: name.trim(), address: toAddress(address) });
      }}
    >
      <div className="flex flex-col gap-[5px]">
        <Label htmlFor="register-name">Name</Label>
        <Input
          id="register-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <AddressFields
        idPrefix="register"
        value={address}
        onChange={setAddress}
        street2Label="Address line 2"
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={register.isPending}>
          Register property
        </Button>
      </DialogFooter>
    </form>
  );
}
