"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { IsoDate } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import { formatMoney, Money } from "@moonship/ui/money";
import { Switch } from "@moonship/ui/switch";

import type { AccountSummary, Lease, PoolOption } from "../../_lib/lease-form";
import type { LeaseAction } from "./lease-action-dialog";
import { useTRPC } from "~/trpc/react";
import { newestLease, stepOn } from "../../_lib/lease-form";
import {
  amountOn,
  chargeNamesOf,
  currentLease,
  rentDate,
  sortedLeases,
} from "../../_lib/lease-terms";
import { formatDate, notifiedDateFormat } from "../../../_lib/format";
import {
  useAccountUpdated,
  useAccountUpdateFailed,
} from "../../../_lib/use-account-updated";
import { Card, CardEmpty, CardRow } from "./card";

function shareText(shareBps: number | undefined): string | null {
  if (shareBps === undefined) return null;
  return `${(shareBps / 100).toFixed(shareBps % 100 === 0 ? 0 : 2)}% share`;
}

export function lateFeeText(lease: Lease | undefined): string {
  if (!lease?.lateFee) return "None";
  return `${formatMoney(lease.lateFee.amountCents)} after day ${lease.lateFee.day}`;
}

export function LeaseTab({
  account,
  pools,
  shares,
  today,
  timeZone,
  onAction,
  onEditLease,
}: {
  account: AccountSummary;
  pools: readonly PoolOption[];
  shares: ReadonlyMap<string, number>;
  today: IsoDate;
  timeZone: string;
  onAction: (action: LeaseAction) => void;
  onEditLease: (lease: Lease) => void;
}) {
  const leases = sortedLeases(account.leases);
  const current = currentLease(leases, today);
  const newest = newestLease(leases);
  const fromCurrent = current
    ? leases.filter((lease) => lease.startDate >= current.startDate)
    : [];

  return (
    <div className="@container">
      <div className="grid gap-3.5 @xl:grid-cols-2">
        <BaseRentCard
          account={account}
          leases={fromCurrent}
          today={today}
          timeZone={timeZone}
          onAdd={() => onAction({ kind: "increase" })}
        />
        <EstimatesCard
          lease={current}
          pools={pools}
          shares={shares}
          today={today}
        />
        <ChargesCard lease={current} today={today} onAction={onAction} />
        <Card
          title="Lease dates"
          action={
            newest?.moveOutDate === null ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAction({ kind: "moveout" })}
                >
                  Set move-out
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAction({ kind: "renew" })}
                >
                  Add renewal
                </Button>
              </>
            ) : null
          }
        >
          {leases.map((lease) => (
            <LeaseRow
              key={lease.id}
              account={account}
              lease={lease}
              label={
                lease === current
                  ? "Current"
                  : current && lease.startDate > current.startDate
                    ? "Next"
                    : "Earlier"
              }
              canRemove={leases.length > 1}
              onEdit={() => onEditLease(lease)}
            />
          ))}
          <CardRow className="grid-cols-[96px_minmax(0,1fr)] text-[12.5px]">
            <span className="text-fg-3">Late fee</span>
            <span>{lateFeeText(current)}</span>
          </CardRow>
        </Card>
      </div>
    </div>
  );
}

function BaseRentCard({
  account,
  leases,
  today,
  timeZone,
  onAdd,
}: {
  account: AccountSummary;
  leases: Lease[];
  today: IsoDate;
  timeZone: string;
  onAdd: () => void;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(account.id);
  const accountUpdateFailed = useAccountUpdateFailed(account.id);
  const notifiedFormat = notifiedDateFormat(timeZone);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const setNotified = useMutation(
    trpc.lease.setRentStepNotified.mutationOptions({
      onSuccess: async (detail) => {
        await accountUpdated(detail);
      },
      onError: accountUpdateFailed,
    }),
  );

  const steps = leases.flatMap((lease) =>
    lease.rentSteps.map((step, index) => ({ lease, step, index })),
  );

  return (
    <Card
      title="Base rent"
      action={
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus />
          Add increase
        </Button>
      }
    >
      {steps.length === 0 ? <CardEmpty>None</CardEmpty> : null}
      {steps.map(({ lease, step, index }) => (
        <CardRow key={step.id} className="grid-cols-[minmax(0,1fr)_auto_auto]">
          <span>From {formatDate(step.startsOn)}</span>
          <Money cents={step.amountCents} />
          {index > 0 && step.startsOn >= yearStart ? (
            <label
              className="text-fg-2 flex items-center gap-1.5 text-[12px]"
              title={
                step.tenantNotifiedAt
                  ? `Notified ${notifiedFormat.format(step.tenantNotifiedAt)}`
                  : "Tenant not notified yet"
              }
            >
              <Switch
                aria-label="Tenant notified"
                checked={step.tenantNotifiedAt !== null}
                disabled={setNotified.isPending}
                onCheckedChange={(notified) =>
                  setNotified.mutate({
                    accountId: account.id,
                    expectedVersion: account.version,
                    leaseId: lease.id,
                    stepId: step.id,
                    notified,
                  })
                }
              />
              Notified
            </label>
          ) : (
            <span />
          )}
        </CardRow>
      ))}
    </Card>
  );
}

function EstimatesCard({
  lease,
  pools,
  shares,
  today,
}: {
  lease: Lease | undefined;
  pools: readonly PoolOption[];
  shares: ReadonlyMap<string, number>;
  today: IsoDate;
}) {
  const date = lease ? rentDate(lease, today) : today;
  const poolIds = lease
    ? [...new Set(lease.estimateSteps.map((step) => step.poolId))]
    : [];
  const rows = poolIds.flatMap((poolId) => {
    const step = lease
      ? stepOn(
          lease.estimateSteps.filter((s) => s.poolId === poolId),
          date,
        )
      : undefined;
    return step
      ? [
          {
            poolId,
            name: pools.find((p) => p.id === poolId)?.name ?? "Other pool",
            amountCents: step.amountCents,
          },
        ]
      : [];
  });

  return (
    <Card
      title="Monthly estimates"
      action={<span className="text-fg-3 text-[12px]">Reset each Jan 1</span>}
    >
      {rows.length === 0 ? <CardEmpty>None</CardEmpty> : null}
      {rows.map((row) => (
        <CardRow key={row.poolId}>
          <span className="min-w-0">
            {row.name}{" "}
            <span className="text-fg-3 text-[11.5px]">
              {shareText(shares.get(row.poolId))}
            </span>
          </span>
          <Money cents={row.amountCents} />
        </CardRow>
      ))}
    </Card>
  );
}

function ChargesCard({
  lease,
  today,
  onAction,
}: {
  lease: Lease | undefined;
  today: IsoDate;
  onAction: (action: LeaseAction) => void;
}) {
  const names = lease ? chargeNamesOf(lease) : [];

  return (
    <Card
      title="Fixed charges"
      action={
        lease ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAction({ kind: "charge-add" })}
          >
            <Plus />
            Add charge
          </Button>
        ) : null
      }
    >
      {names.length === 0 ? (
        <CardEmpty>
          None. Use this for monthly extras like sign rent or trash.
        </CardEmpty>
      ) : null}
      {lease
        ? names.map((name) => {
            const steps = lease.fixedChargeSteps.filter((s) => s.name === name);
            const current = amountOn(steps, today);
            const next = steps.find((s) => s.startsOn > today);
            const stopAt = steps.find(
              (s) => s.startsOn > today && s.amountCents === 0,
            );
            const now =
              current > 0
                ? `${formatMoney(current)} a month${stopAt ? ` until ${formatDate(stopAt.startsOn)}` : ""}`
                : next && next.amountCents > 0
                  ? `Starts ${formatDate(next.startsOn)}`
                  : "Stopped";
            const history =
              steps.length > 1
                ? steps
                    .map((s) =>
                      s.amountCents
                        ? `${formatMoney(s.amountCents)} from ${formatDate(s.startsOn)}`
                        : `stopped ${formatDate(s.startsOn)}`,
                    )
                    .join(" · ")
                : `Since ${formatDate(steps[0]?.startsOn)}`;
            const live =
              (current > 0 || (next !== undefined && next.amountCents > 0)) &&
              !stopAt;
            return (
              <CardRow
                key={name}
                className="grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <span className="min-w-0">
                  {name}
                  <span className="text-fg-3 block text-[11.5px]">
                    {history}
                  </span>
                </span>
                <span
                  className={`font-mono text-[12.5px] whitespace-nowrap ${current > 0 ? "" : "text-fg-3"}`}
                >
                  {now}
                </span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction({ kind: "charge-change", name })}
                  >
                    Change
                  </Button>
                  {live ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red hover:text-red"
                      onClick={() => onAction({ kind: "charge-stop", name })}
                    >
                      Stop
                    </Button>
                  ) : null}
                </span>
              </CardRow>
            );
          })
        : null}
    </Card>
  );
}

function LeaseRow({
  account,
  lease,
  label,
  canRemove,
  onEdit,
}: {
  account: AccountSummary;
  lease: Lease;
  label: string;
  canRemove: boolean;
  onEdit: () => void;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(account.id);
  const accountUpdateFailed = useAccountUpdateFailed(account.id);
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation(
    trpc.lease.remove.mutationOptions({
      onSuccess: async (detail) => {
        await accountUpdated(detail);
        toast.success("Lease removed");
      },
      onError: accountUpdateFailed,
    }),
  );

  return (
    <CardRow className="group grid-cols-[96px_minmax(0,1fr)_auto] text-[12.5px]">
      <span className="text-fg-3">{label}</span>
      <span className="min-w-0">
        {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
        {lease.moveOutDate
          ? ` · moved out ${formatDate(lease.moveOutDate)}`
          : ""}
      </span>
      {confirming ? (
        <span className="flex items-center gap-1.5">
          <span className="text-fg-3 text-[11.5px]">Remove lease?</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Keep
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate({
                accountId: account.id,
                expectedVersion: account.version,
                leaseId: lease.id,
              })
            }
          >
            Remove
          </Button>
        </span>
      ) : (
        <span className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove lease"
              title="Remove lease"
              className="hover:text-red opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
            </Button>
          ) : null}
        </span>
      )}
    </CardRow>
  );
}
