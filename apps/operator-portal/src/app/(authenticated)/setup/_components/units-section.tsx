"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  formatPercentBps,
  formatSqft,
  poolShareTable,
} from "@moonship/billing";
import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { Checkbox } from "@moonship/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@moonship/ui/dropdown-menu";
import { EmptyState } from "@moonship/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { PoolView } from "./pool-dialog";
import type { UnitView } from "./unit-dialog";
import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";
import { formatStreet } from "./address-fields";
import { ConfirmDialog } from "./confirm-dialog";
import { PoolDialog } from "./pool-dialog";
import { HOVER_ACTION, InlineConfirm } from "./row-actions";
import { UnitDialog } from "./unit-dialog";

export function UnitsSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const { data: pools } = useSuspenseQuery(trpc.pool.list.queryOptions());
  const [unitDialog, setUnitDialog] = useState<{
    open: boolean;
    unit: UnitView | null;
  }>({ open: false, unit: null });
  const [poolDialog, setPoolDialog] = useState<{
    open: boolean;
    pool: PoolView | null;
  }>({ open: false, pool: null });
  const [removingUnitId, setRemovingUnitId] = useState<string | null>(null);
  const [removingPool, setRemovingPool] = useState<PoolView | null>(null);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.pool.list.queryFilter()),
      queryClient.invalidateQueries(trpc.unit.list.queryFilter()),
      queryClient.invalidateQueries(trpc.account.pathFilter()),
      ledgerChanged(),
    ]);

  const setUnits = useMutation(
    trpc.pool.setUnits.mutationOptions({
      onSuccess: invalidate,
      onError: (err) => toast.error(err.message),
    }),
  );

  const updatePool = useMutation(
    trpc.pool.update.mutationOptions({
      onSuccess: async (pool) => {
        await invalidate();
        toast.success(
          pool.addsNewUnits
            ? `New units join ${pool.name}`
            : `New units don't join ${pool.name}`,
        );
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const removeUnit = useMutation(
    trpc.unit.remove.mutationOptions({
      onSuccess: async () => {
        setRemovingUnitId(null);
        await invalidate();
        toast.success("Unit removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const removePool = useMutation(
    trpc.pool.remove.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          invalidate(),
          queryClient.invalidateQueries(trpc.category.list.queryFilter()),
        ]);
        toast.success("Pool removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const pending = setUnits.isPending ? setUnits.variables : undefined;
  const memberIds = (pool: PoolView): string[] =>
    pending?.id === pool.id
      ? pending.unitIds
      : pool.units.map((unit) => unit.unitId);
  const tables = new Map(
    pools.map((pool) => [pool.id, poolShareTable(memberIds(pool), units)]),
  );

  const toggle = (pool: PoolView, unit: UnitView, checked: boolean) => {
    const before = memberIds(pool);
    const after = checked
      ? [...before, unit.id]
      : before.filter((id) => id !== unit.id);
    setUnits.mutate(
      { id: pool.id, unitIds: after },
      {
        onSuccess: () => {
          toast.success(
            checked
              ? `${unit.label} added to ${pool.name}`
              : `${unit.label} removed from ${pool.name}`,
            {
              action: {
                label: "Undo",
                onClick: () =>
                  setUnits.mutate({ id: pool.id, unitIds: before }),
              },
            },
          );
        },
      },
    );
  };

  const autoPoolNames = pools
    .filter((pool) => pool.addsNewUnits)
    .map((pool) => pool.name);
  const totalSqft = units.reduce((sum, unit) => sum + unit.sqft, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => setUnitDialog({ open: true, unit: null })}
        >
          <Plus />
          Add unit
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPoolDialog({ open: true, pool: null })}
        >
          <Plus />
          Add pool
        </Button>
      </div>

      {units.length === 0 ? (
        <EmptyState headline="No units yet" />
      ) : (
        <Table containerClassName="animate-rise">
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Sqft</TableHead>
              {pools.map((pool) => (
                <TableHead
                  key={pool.id}
                  className="h-auto py-1.5 text-center align-middle"
                >
                  <div className="inline-flex items-center gap-0.5">
                    <span className="text-foreground text-[12px] font-medium">
                      {pool.name}
                    </span>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${pool.name} pool options`}
                          className="size-5"
                        >
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuLabel className="text-fg-3 text-[11.5px] font-normal">
                          Letters call it &quot;{pool.letterName}&quot;
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={() => setPoolDialog({ open: true, pool })}
                        >
                          <Pencil />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuCheckboxItem
                          checked={pool.addsNewUnits}
                          disabled={updatePool.isPending}
                          onCheckedChange={(checked) =>
                            updatePool.mutate({
                              id: pool.id,
                              addsNewUnits: checked,
                            })
                          }
                        >
                          Add new units automatically
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setRemovingPool(pool)}
                        >
                          <Trash2 />
                          Remove pool
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {pool.addsNewUnits ? (
                    <div className="text-fg-3 text-2xs font-normal">
                      Adds new units
                    </div>
                  ) : null}
                </TableHead>
              ))}
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id} className="group">
                <TableCell>
                  <div className="font-medium">{unit.label}</div>
                  <div className="text-fg-3 text-[11.5px]">
                    {formatStreet(unit.address)}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatSqft(unit.sqft)}
                </TableCell>
                {pools.map((pool) => {
                  const row = tables
                    .get(pool.id)
                    ?.rows.find((share) => share.unitId === unit.id);
                  return (
                    <TableCell key={pool.id} className="text-center">
                      <Checkbox
                        checked={row !== undefined}
                        disabled={setUnits.isPending}
                        onCheckedChange={(checked) =>
                          toggle(pool, unit, checked === true)
                        }
                        aria-label={`${unit.label} in ${pool.name}`}
                        className="align-middle"
                      />
                      <span className="text-fg-3 mt-0.5 block font-mono text-[11px]">
                        {row ? formatPercentBps(row.shareBps) : "·"}
                      </span>
                    </TableCell>
                  );
                })}
                <TableCell className="text-right">
                  {removingUnitId === unit.id ? (
                    <InlineConfirm
                      question="Remove unit?"
                      confirmLabel="Remove"
                      pending={removeUnit.isPending}
                      onKeep={() => setRemovingUnitId(null)}
                      onConfirm={() => removeUnit.mutate({ id: unit.id })}
                    />
                  ) : (
                    <span
                      className={cn("flex justify-end gap-0.5", HOVER_ACTION)}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit unit ${unit.label}`}
                        title="Edit unit"
                        onClick={() => setUnitDialog({ open: true, unit })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove unit ${unit.label}`}
                        title="Remove unit"
                        className="hover:text-red"
                        onClick={() => setRemovingUnitId(unit.id)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right font-mono">
                {formatSqft(totalSqft)}
              </TableCell>
              {pools.map((pool) => (
                <TableCell key={pool.id} className="text-center font-mono">
                  {formatSqft(tables.get(pool.id)?.totalSqft ?? 0)}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <UnitDialog
        open={unitDialog.open}
        onOpenChange={(open) => setUnitDialog({ ...unitDialog, open })}
        unit={unitDialog.unit}
        buildingAddress={property.address}
        autoPoolNames={autoPoolNames}
      />
      <PoolDialog
        open={poolDialog.open}
        onOpenChange={(open) => setPoolDialog({ ...poolDialog, open })}
        pool={poolDialog.pool}
      />
      <ConfirmDialog
        open={removingPool !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingPool(null);
        }}
        title={`Remove ${removingPool?.name ?? ""}?`}
        description="Its shared-cost category goes with it. You can't remove a pool while a lease has estimates for it or transactions are sorted to it."
        confirmLabel="Remove pool"
        onConfirm={() => {
          if (removingPool) removePool.mutate({ id: removingPool.id });
        }}
      />
    </div>
  );
}
