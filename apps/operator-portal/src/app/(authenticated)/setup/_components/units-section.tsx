"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { formatSqft } from "@moonship/billing";
import { Button } from "@moonship/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { UnitView } from "./unit-dialog";
import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";
import { formatStreet } from "./address-fields";
import { ConfirmDialog } from "./confirm-dialog";
import { UnitDialog } from "./unit-dialog";

export function UnitsSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const { data: pools } = useSuspenseQuery(trpc.pool.list.queryOptions());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UnitView | null>(null);
  const [removing, setRemoving] = useState<UnitView | null>(null);

  const remove = useMutation(
    trpc.unit.remove.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.unit.list.queryFilter()),
          queryClient.invalidateQueries(trpc.pool.list.queryFilter()),
          ledgerChanged(),
        ]);
        toast.success("Unit removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const poolNames = (unit: UnitView) =>
    pools
      .filter((pool) => unit.poolIds.includes(pool.id))
      .map((pool) => pool.name)
      .join(", ");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Units ({units.length})</h2>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add unit
        </Button>
      </div>
      {units.length === 0 ? (
        <p className="text-muted-foreground text-sm">No units yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-right">Sqft</TableHead>
              <TableHead>Pools</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-medium">{unit.label}</TableCell>
                <TableCell>{formatStreet(unit.address)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatSqft(unit.sqft)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {poolNames(unit) || "None"}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(unit);
                      setDialogOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRemoving(unit)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <UnitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        unit={editing}
        buildingAddress={property.address}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Remove unit ${removing?.label ?? ""}?`}
        description="The unit leaves every pool it is in. A unit with an account can't be removed."
        confirmLabel="Remove unit"
        onConfirm={() => {
          if (removing) remove.mutate({ id: removing.id });
        }}
      />
    </section>
  );
}
