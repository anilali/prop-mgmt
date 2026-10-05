"use client";

import { useMutation } from "@tanstack/react-query";

import { formatCents } from "@moonship/shared";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { Lease, PoolOption } from "../../_lib/lease-form";
import { useTRPC } from "~/trpc/react";
import { formatDate, notifiedDateFormat } from "../../_lib/format";
import {
  useAccountUpdated,
  useAccountUpdateFailed,
} from "./use-account-updated";

export function LeaseCard({
  accountId,
  version,
  timeZone,
  lease,
  pools,
  isNewest,
  canRemove,
  onEdit,
  onRemove,
}: {
  accountId: string;
  version: number;
  timeZone: string;
  lease: Lease;
  pools: readonly PoolOption[];
  isNewest: boolean;
  canRemove: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(accountId);
  const accountUpdateFailed = useAccountUpdateFailed(accountId);
  const notifiedFormat = notifiedDateFormat(timeZone);

  const setNotified = useMutation(
    trpc.lease.setRentStepNotified.mutationOptions({
      onSuccess: async (detail) => {
        await accountUpdated(detail);
      },
      onError: accountUpdateFailed,
    }),
  );

  const poolOrder = (poolId: string) => {
    const index = pools.findIndex((pool) => pool.id === poolId);
    return index === -1 ? pools.length : index;
  };
  const estimatePoolIds = [
    ...new Set(lease.estimateSteps.map((step) => step.poolId)),
  ].sort((a, b) => poolOrder(a) - poolOrder(b));
  const poolName = (poolId: string) =>
    pools.find((pool) => pool.id === poolId)?.name ?? "Other pool";
  const chargeNames = [
    ...new Set(lease.fixedChargeSteps.map((step) => step.name)),
  ];

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">
              {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
            </h2>
            {isNewest ? <Badge variant="secondary">Newest</Badge> : null}
          </div>
          <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="inline">Move-out: </dt>
              <dd className="inline">{formatDate(lease.moveOutDate)}</dd>
            </div>
            <div>
              <dt className="inline">Late fee: </dt>
              <dd className="inline">
                {lease.lateFee
                  ? `${formatCents(lease.lateFee.amountCents)} after day ${lease.lateFee.day}`
                  : "None"}
              </dd>
            </div>
            <div>
              <dt className="inline">Insurance expires: </dt>
              <dd className="inline">
                {lease.insuranceExpiresOn
                  ? formatDate(lease.insuranceExpiresOn)
                  : "Not on file"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          {canRemove ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemove}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Base rent</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Starts</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
                <TableHead>Tenant notified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lease.rentSteps.map((step, index) => (
                <TableRow key={step.id}>
                  <TableCell>{formatDate(step.startsOn)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(step.amountCents)}
                  </TableCell>
                  <TableCell>
                    {index === 0 ? null : (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={step.tenantNotifiedAt !== null}
                          disabled={setNotified.isPending}
                          onChange={(e) =>
                            setNotified.mutate({
                              accountId,
                              expectedVersion: version,
                              leaseId: lease.id,
                              stepId: step.id,
                              notified: e.target.checked,
                            })
                          }
                        />
                        {step.tenantNotifiedAt
                          ? notifiedFormat.format(step.tenantNotifiedAt)
                          : "Not yet"}
                      </label>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Estimates</h3>
          {estimatePoolIds.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This lease pays no pools.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estimatePoolIds.flatMap((poolId) =>
                  lease.estimateSteps
                    .filter((step) => step.poolId === poolId)
                    .map((step, index) => (
                      <TableRow key={step.id}>
                        <TableCell className="font-medium">
                          {index === 0 ? poolName(poolId) : null}
                        </TableCell>
                        <TableCell>{formatDate(step.startsOn)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(step.amountCents)}
                        </TableCell>
                      </TableRow>
                    )),
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Fixed monthly charges</h3>
          {chargeNames.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This lease has no fixed charges.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charge</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chargeNames.flatMap((name) =>
                  lease.fixedChargeSteps
                    .filter((step) => step.name === name)
                    .map((step, index) => (
                      <TableRow key={step.id}>
                        <TableCell className="font-medium">
                          {index === 0 ? name : null}
                        </TableCell>
                        <TableCell>{formatDate(step.startsOn)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(step.amountCents)}
                        </TableCell>
                      </TableRow>
                    )),
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </section>
  );
}
