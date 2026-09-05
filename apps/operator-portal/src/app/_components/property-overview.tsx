"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";

import { useTRPC } from "~/trpc/react";

export function PropertyOverview() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());

  const [name, setName] = useState("");
  const [street1, setStreet1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");

  const bootstrap = useMutation(
    trpc.property.bootstrap.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.property.get.queryFilter());
        // Refresh RSC session so staff membership appears after auto-provision.
        window.location.reload();
      },
    }),
  );

  if (!property) {
    return (
      <form
        className="w-full max-w-lg space-y-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          bootstrap.mutate({
            name,
            address: {
              street1,
              city,
              state,
              postalCode,
              country,
            },
          });
        }}
      >
        <p className="text-muted-foreground text-sm">
          Bootstrap the singleton property for this deployment.
        </p>
        <Input
          placeholder="Property name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          placeholder="Street"
          value={street1}
          onChange={(e) => setStreet1(e.target.value)}
          required
        />
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
        <Button type="submit" disabled={bootstrap.isPending}>
          {bootstrap.isPending ? "Creating…" : "Bootstrap property"}
        </Button>
        {bootstrap.error ? (
          <p className="text-sm text-red-600">{bootstrap.error.message}</p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="w-full max-w-lg space-y-2 text-left">
      <h2 className="text-xl font-semibold">{property.name}</h2>
      <p className="text-muted-foreground text-sm">
        {[
          property.address.street1,
          property.address.street2,
          property.address.city,
          property.address.state,
          property.address.postalCode,
          property.address.country,
        ]
          .filter(Boolean)
          .join(", ")}
      </p>
    </div>
  );
}
