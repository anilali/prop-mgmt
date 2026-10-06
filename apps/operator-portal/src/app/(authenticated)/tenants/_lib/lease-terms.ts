import type { Address, IsoDate } from "@moonship/shared";
import { addDays, addMonths, firstDay, monthOf } from "@moonship/shared";

import type { Lease, LeaseFormState, PoolOption } from "./lease-form";
import { centsToInput } from "../../_lib/format";
import { leaseToForm, newRowKey, stepOn } from "./lease-form";

export function sortedLeases(leases: readonly Lease[]): Lease[] {
  return [...leases].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

export function leaseLastDay(lease: Lease): IsoDate {
  return lease.moveOutDate ?? lease.endDate;
}

export function coveringLease(
  leases: readonly Lease[],
  date: IsoDate,
): Lease | undefined {
  const sorted = sortedLeases(leases);
  const inside = sorted.find(
    (lease) => lease.startDate <= date && date <= leaseLastDay(lease),
  );
  if (inside) return inside;
  const newest = sorted[sorted.length - 1];
  if (newest?.moveOutDate === null && date > newest.endDate) {
    return newest;
  }
  return undefined;
}

export function currentLease(
  leases: readonly Lease[],
  today: IsoDate,
): Lease | undefined {
  const sorted = sortedLeases(leases);
  return (
    coveringLease(sorted, today) ??
    sorted.find((lease) => lease.startDate > today) ??
    sorted[sorted.length - 1]
  );
}

export function amountOn<T extends { startsOn: IsoDate; amountCents: number }>(
  steps: readonly T[],
  date: IsoDate,
): number {
  return stepOn(steps, date)?.amountCents ?? 0;
}

export interface RentLine {
  key: string;
  label: string;
  amountCents: number;
}

export function rentLines(
  lease: Lease,
  date: IsoDate,
  poolName: (poolId: string) => string,
): RentLine[] {
  const lines: RentLine[] = [
    {
      key: "base",
      label: "Base",
      amountCents: amountOn(lease.rentSteps, date),
    },
  ];
  const poolIds = [...new Set(lease.estimateSteps.map((step) => step.poolId))];
  for (const poolId of poolIds) {
    const step = stepOn(
      lease.estimateSteps.filter((s) => s.poolId === poolId),
      date,
    );
    if (step) {
      lines.push({
        key: `pool-${poolId}`,
        label: poolName(poolId),
        amountCents: step.amountCents,
      });
    }
  }
  for (const name of chargeNamesOf(lease)) {
    const amountCents = amountOn(
      lease.fixedChargeSteps.filter((s) => s.name === name),
      date,
    );
    if (amountCents > 0) {
      lines.push({ key: `charge-${name}`, label: name, amountCents });
    }
  }
  return lines;
}

export function rentDate(lease: Lease, today: IsoDate): IsoDate {
  const monthStart = firstDay(monthOf(today));
  return lease.startDate > monthStart ? lease.startDate : monthStart;
}

export function chargeNamesOf(lease: Lease): string[] {
  return [...new Set(lease.fixedChargeSteps.map((step) => step.name))];
}

export function nextMonthStart(today: IsoDate): IsoDate {
  return firstDay(addMonths(monthOf(today), 1));
}

export function nextAnniversary(start: IsoDate, today: IsoDate): IsoDate {
  const thisYear = `${today.slice(0, 4)}${start.slice(4)}`;
  if (thisYear > today) return thisYear;
  return `${Number(today.slice(0, 4)) + 1}${start.slice(4)}`;
}

export function threeYearsFrom(start: IsoDate): IsoDate {
  return addDays(firstDay(addMonths(monthOf(start), 36)), -1);
}

export interface LeaseChange {
  lease: Lease;
  form: LeaseFormState;
}

export function chargeChanges(
  leases: readonly Lease[],
  pools: readonly PoolOption[],
  name: string,
  from: IsoDate,
  amountCents: number,
): LeaseChange[] {
  const sorted = sortedLeases(leases);
  const covering = coveringLease(sorted, from);
  if (!covering) {
    throw new Error("Pick a date during a lease on this account");
  }
  const key = name.trim().toLowerCase();
  const amount = centsToInput(amountCents);
  const changes: LeaseChange[] = [];
  for (const lease of sorted) {
    if (lease.startDate < covering.startDate) continue;
    const form = leaseToForm(lease, pools);
    const existing = form.fixedCharges.find(
      (charge) => charge.name.trim().toLowerCase() === key,
    );
    const others = form.fixedCharges.filter((charge) => charge !== existing);
    let steps: { key: string; startsOn: IsoDate; amount: string }[];
    if (lease === covering) {
      const kept = existing
        ? existing.steps.filter((step) => step.startsOn < from)
        : [];
      steps =
        amountCents === 0 && kept.length === 0
          ? []
          : [...kept, { key: newRowKey(), startsOn: from, amount }];
    } else {
      steps =
        amountCents === 0
          ? []
          : [{ key: newRowKey(), startsOn: lease.startDate, amount }];
    }
    if (!existing && steps.length === 0) continue;
    const fixedCharges =
      steps.length === 0
        ? others
        : [
            ...others,
            {
              key: existing?.key ?? newRowKey(),
              name: existing?.name ?? name.trim(),
              steps,
            },
          ];
    changes.push({ lease, form: { ...form, fixedCharges } });
  }
  return changes;
}

export function formatAddressLines(address: Address): string[] {
  const lines = [address.street1];
  if (address.street2) lines.push(address.street2);
  lines.push(`${address.city}, ${address.state} ${address.postalCode}`);
  if (address.country && address.country !== "US") lines.push(address.country);
  return lines;
}
