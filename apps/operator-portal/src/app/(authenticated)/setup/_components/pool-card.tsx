"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { poolShareTable } from "@moonship/billing";
import { Button } from "@moonship/ui/button";
import { Checkbox } from "@moonship/ui/checkbox";
import { Label } from "@moonship/ui/label";
import { Switch } from "@moonship/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { PoolView } from "./pool-dialog";
import type { UnitView } from "./unit-dialog";
import { useTRPC } from "~/trpc/react";
import { formatShare, formatSqft } from "./format";

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function PoolCard({
  pool,
  units,
  onRename,
  onRemove,
}: {
  pool: PoolView;
  units: UnitView[];
  onRename: () => void;
  onRemove: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const savedIds = pool.units.map((unit) => unit.unitId);
  const [selectedIds, setSelectedIds] = useState<string[]>(savedIds);
  const table = poolShareTable(selectedIds, units);
  const shareByUnit = new Map(table.rows.map((row) => [row.unitId, row]));
  const dirty = !sameIds(savedIds, selectedIds);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.pool.list.queryFilter()),
      queryClient.invalidateQueries(trpc.unit.list.queryFilter()),
    ]);

  const setUnits = useMutation(
    trpc.pool.setUnits.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success(`${pool.name} units saved`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const update = useMutation(
    trpc.pool.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success(`${pool.name} saved`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const toggle = (unitId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, unitId] : prev.filter((id) => id !== unitId),
    );
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-medium">{pool.name}</h3>
          <p className="text-muted-foreground text-sm">
            Letter name: {pool.letterName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={`pool-${pool.id}-adds-new-units`}
              checked={pool.addsNewUnits}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate({ id: pool.id, addsNewUnits: checked })
              }
            />
            <Label htmlFor={`pool-${pool.id}-adds-new-units`}>
              Takes new units
            </Label>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRename}>
            Rename
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>

      {units.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Add units to choose who shares this cost.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Sqft</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => {
              const row = shareByUnit.get(unit.id);
              const checkboxId = `pool-${pool.id}-unit-${unit.id}`;
              return (
                <TableRow key={unit.id}>
                  <TableCell>
                    <Checkbox
                      id={checkboxId}
                      checked={row !== undefined}
                      onCheckedChange={(checked) =>
                        toggle(unit.id, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Label htmlFor={checkboxId} className="font-normal">
                      {unit.label}
                    </Label>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSqft(unit.sqft)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row ? formatShare(row.shareBps) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-medium">
              <TableCell />
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatSqft(table.totalSqft)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      )}

      {dirty ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedIds(savedIds)}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={setUnits.isPending}
            onClick={() =>
              setUnits.mutate({ id: pool.id, unitIds: selectedIds })
            }
          >
            Save units
          </Button>
        </div>
      ) : null}
    </div>
  );
}
