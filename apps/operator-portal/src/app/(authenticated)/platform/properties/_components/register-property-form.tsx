"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import { useTRPC } from "~/trpc/react";

export function RegisterPropertyForm({ onDone }: { onDone?: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [street1, setStreet1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");

  const register = useMutation(
    trpc.property.register.mutationOptions({
      onSuccess: async (property) => {
        await queryClient.invalidateQueries(trpc.property.list.queryFilter());
        toast.success("Property registered");
        onDone?.();
        router.push(`/platform/properties/${property.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate({
          name,
          address: { street1, city, state, postalCode, country },
        });
      }}
    >
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Street</Label>
        <Input
          value={street1}
          onChange={(e) => setStreet1(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
        />
        <Input
          placeholder="State"
          value={state}
          onChange={(e) => setState(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Postal code"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          required
        />
        <Input
          placeholder="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={register.isPending}>
        Register property
      </Button>
    </form>
  );
}
