"use client";

import { Suspense, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";
import { Badge } from "@moonship/ui/badge";
import type { RouterOutputs } from "@moonship/api-operator";

import { useTRPC } from "~/trpc/react";
import { UnitDialog } from "./unit-dialog";
import { BootstrapPropertyForm } from "./bootstrap-property-form";
import { PendingStaffAccess } from "./pending-staff-access";

type PropertyView = NonNullable<RouterOutputs["property"]["get"]>;

export function PropertyPageContent({
  isActiveStaff,
  canClaimAdmin,
}: {
  isActiveStaff: boolean;
  canClaimAdmin: boolean;
}) {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());

  if (!property) {
    return <BootstrapPropertyForm />;
  }

  if (!isActiveStaff) {
    return <PendingStaffAccess canClaimAdmin={canClaimAdmin} />;
  }

  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading units…</p>}>
      <ConfiguredPropertyContent property={property} />
    </Suspense>
  );
}

function ConfiguredPropertyContent({ property }: { property: PropertyView }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState(property.name);
  const [street1, setStreet1] = useState(property.address.street1);
  const [city, setCity] = useState(property.address.city);
  const [state, setState] = useState(property.address.state);
  const [postalCode, setPostalCode] = useState(property.address.postalCode);
  const [country, setCountry] = useState(property.address.country);

  const updateProperty = useMutation(
    trpc.property.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.property.get.queryFilter());
        toast.success("Property updated");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const removeUnit = useMutation(
    trpc.unit.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.unit.list.queryFilter());
        toast.success("Unit removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Details</h2>
        <form
          className="grid max-w-xl gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateProperty.mutate({
              name,
              address: { street1, city, state, postalCode, country },
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="street1">Street</Label>
            <Input
              id="street1"
              value={street1}
              onChange={(e) => setStreet1(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="postalCode">Postal code</Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={updateProperty.isPending}>
            Save property
          </Button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Units ({units.length})</h2>
          <Button type="button" onClick={() => setCreating(true)}>
            Add unit
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Sqft</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Utilities</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-medium">{unit.label}</TableCell>
                <TableCell>{unit.sqft}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{unit.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {unit.utilities.length === 0
                    ? "—"
                    : unit.utilities
                        .map((u) =>
                          u.kind === "individual"
                            ? `${u.type}: own`
                            : `${u.type}: shares`,
                        )
                        .join(", ")}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingUnitId(unit.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeUnit.mutate({ id: unit.id })}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <UnitDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        units={units}
      />
      <UnitDialog
        open={editingUnitId != null}
        onOpenChange={(open) => {
          if (!open) setEditingUnitId(null);
        }}
        mode="edit"
        unit={units.find((u) => u.id === editingUnitId)}
        units={units}
      />
    </div>
  );
}
