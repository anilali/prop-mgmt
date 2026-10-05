"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";

import type { PoolView } from "./pool-dialog";
import { useTRPC } from "~/trpc/react";
import { ConfirmDialog } from "./confirm-dialog";
import { PoolCard } from "./pool-card";
import { PoolDialog } from "./pool-dialog";

export function PoolsSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: pools } = useSuspenseQuery(trpc.pool.list.queryOptions());
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PoolView | null>(null);
  const [removing, setRemoving] = useState<PoolView | null>(null);

  const remove = useMutation(
    trpc.pool.remove.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.pool.list.queryFilter()),
          queryClient.invalidateQueries(trpc.unit.list.queryFilter()),
          queryClient.invalidateQueries(trpc.category.list.queryFilter()),
        ]);
        toast.success("Pool removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Cost pools</h2>
          <p className="text-muted-foreground text-sm">
            Each unit&apos;s share is its sqft divided by the total sqft of the
            pool&apos;s units.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add pool
        </Button>
      </div>
      {pools.length === 0 ? (
        <p className="text-muted-foreground text-sm">No pools yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pools.map((pool) => (
            <PoolCard
              key={`${pool.id}:${pool.units.map((unit) => unit.unitId).join(",")}`}
              pool={pool}
              units={units}
              onRename={() => {
                setEditing(pool);
                setDialogOpen(true);
              }}
              onRemove={() => setRemoving(pool)}
            />
          ))}
        </div>
      )}

      <PoolDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pool={editing}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Remove ${removing?.name ?? ""}?`}
        description="Its shared-cost category is removed with it. A pool can't be removed while a lease has estimates for it or transactions are sorted to it."
        confirmLabel="Remove pool"
        onConfirm={() => {
          if (removing) remove.mutate({ id: removing.id });
        }}
      />
    </section>
  );
}
