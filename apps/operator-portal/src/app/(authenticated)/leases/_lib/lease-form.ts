import type { RouterInputs, RouterOutputs } from "@moonship/api-operator";
import type { IsoDate } from "@moonship/shared";
import { addDays, parseCents, prorate } from "@moonship/shared";

import { centsToInput } from "./format";

export type AccountDetail = RouterOutputs["account"]["get"];
export type AccountSummary = AccountDetail["account"];
export type Lease = AccountSummary["leases"][number];
export type LeaseInput = RouterInputs["lease"]["add"]["lease"];

export interface PoolOption {
  id: string;
  name: string;
}

export interface StepRow {
  key: string;
  id?: string;
  startsOn: IsoDate;
  amount: string;
}

export interface PoolEstimate {
  pays: boolean;
  steps: StepRow[];
}

export interface LeaseFormState {
  startDate: IsoDate;
  endDate: IsoDate;
  moveOutDate: IsoDate;
  rentSteps: StepRow[];
  estimates: Record<string, PoolEstimate>;
  hasLateFee: boolean;
  lateFeeAmount: string;
  lateFeeDay: string;
  insuranceExpiresOn: IsoDate;
}

export type IncreaseMode = "percent" | "amount";

let rowCounter = 0;

export function newRowKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function stepOn<T extends { startsOn: IsoDate }>(
  steps: readonly T[],
  date: IsoDate,
): T | undefined {
  let found: T | undefined;
  for (const step of steps) {
    if (step.startsOn <= date && (!found || step.startsOn > found.startsOn)) {
      found = step;
    }
  }
  return found;
}

export function newestLease(leases: readonly Lease[]): Lease | undefined {
  let newest: Lease | undefined;
  for (const lease of leases) {
    if (!newest || lease.startDate > newest.startDate) newest = lease;
  }
  return newest;
}

export function emptyLeaseForm(pools: readonly PoolOption[]): LeaseFormState {
  return {
    startDate: "",
    endDate: "",
    moveOutDate: "",
    rentSteps: [{ key: newRowKey(), startsOn: "", amount: "" }],
    estimates: Object.fromEntries(
      pools.map((pool) => [pool.id, { pays: false, steps: [] }]),
    ),
    hasLateFee: false,
    lateFeeAmount: "",
    lateFeeDay: "",
    insuranceExpiresOn: "",
  };
}

export function leaseToForm(
  lease: Lease,
  pools: readonly PoolOption[],
): LeaseFormState {
  const estimates: Record<string, PoolEstimate> = Object.fromEntries(
    pools.map((pool) => [pool.id, { pays: false, steps: [] }]),
  );
  for (const step of lease.estimateSteps) {
    const current = estimates[step.poolId] ?? { pays: true, steps: [] };
    estimates[step.poolId] = {
      pays: true,
      steps: [
        ...current.steps,
        {
          key: newRowKey(),
          startsOn: step.startsOn,
          amount: centsToInput(step.amountCents),
        },
      ],
    };
  }
  return {
    startDate: lease.startDate,
    endDate: lease.endDate,
    moveOutDate: lease.moveOutDate ?? "",
    rentSteps: lease.rentSteps.map((step) => ({
      key: newRowKey(),
      id: step.id,
      startsOn: step.startsOn,
      amount: centsToInput(step.amountCents),
    })),
    estimates,
    hasLateFee: lease.lateFee !== null,
    lateFeeAmount: lease.lateFee ? centsToInput(lease.lateFee.amountCents) : "",
    lateFeeDay: lease.lateFee ? String(lease.lateFee.day) : "",
    insuranceExpiresOn: lease.insuranceExpiresOn ?? "",
  };
}

export function renewalForm(
  newest: Lease,
  pools: readonly PoolOption[],
): LeaseFormState {
  const startDate = addDays(newest.endDate, 1);
  const currentAmount = <T extends { startsOn: IsoDate; amountCents: number }>(
    steps: readonly T[],
  ) => (stepOn(steps, startDate) ?? steps[steps.length - 1])?.amountCents;

  const estimates: Record<string, PoolEstimate> = Object.fromEntries(
    pools.map((pool) => [pool.id, { pays: false, steps: [] }]),
  );
  const paidPoolIds = new Set(newest.estimateSteps.map((step) => step.poolId));
  for (const poolId of paidPoolIds) {
    const amount = currentAmount(
      newest.estimateSteps.filter((step) => step.poolId === poolId),
    );
    estimates[poolId] = {
      pays: true,
      steps: [
        {
          key: newRowKey(),
          startsOn: startDate,
          amount: amount === undefined ? "" : centsToInput(amount),
        },
      ],
    };
  }

  const rent = currentAmount(newest.rentSteps);
  return {
    startDate,
    endDate: "",
    moveOutDate: "",
    rentSteps: [
      {
        key: newRowKey(),
        startsOn: startDate,
        amount: rent === undefined ? "" : centsToInput(rent),
      },
    ],
    estimates,
    hasLateFee: newest.lateFee !== null,
    lateFeeAmount: newest.lateFee
      ? centsToInput(newest.lateFee.amountCents)
      : "",
    lateFeeDay: newest.lateFee ? String(newest.lateFee.day) : "",
    insuranceExpiresOn: newest.insuranceExpiresOn ?? "",
  };
}

export function withStartDate(
  form: LeaseFormState,
  startDate: IsoDate,
): LeaseFormState {
  const previous = form.startDate;
  return {
    ...form,
    startDate,
    rentSteps: form.rentSteps.map((step, index) =>
      index === 0 ? { ...step, startsOn: startDate } : step,
    ),
    estimates: Object.fromEntries(
      Object.entries(form.estimates).map(([poolId, estimate]) => [
        poolId,
        {
          ...estimate,
          steps: estimate.steps.map((step) =>
            step.startsOn === previous
              ? { ...step, startsOn: startDate }
              : step,
          ),
        },
      ]),
    ),
  };
}

export function parseAmount(text: string, label: string): number {
  let cents: number;
  try {
    cents = parseCents(text);
  } catch {
    throw new Error(`Enter a valid amount for the ${label}`);
  }
  if (cents < 0) {
    throw new Error(`The ${label} cannot be negative`);
  }
  return cents;
}

export function parseSignedAmount(text: string, label: string): number {
  try {
    return parseCents(text);
  } catch {
    throw new Error(`Enter a valid amount for the ${label}`);
  }
}

function parsePercentBps(text: string): number {
  const match = /^([-+])?(\d+)(?:\.(\d{1,2}))?$/.exec(
    text.trim().replace(/%$/, "").trim(),
  );
  if (!match) {
    throw new Error("Enter a percentage with at most two decimals");
  }
  const [, sign, whole = "0", fraction = ""] = match;
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return sign === "-" ? -bps : bps;
}

export function addIncrease(
  form: LeaseFormState,
  date: IsoDate,
  mode: IncreaseMode,
  value: string,
): StepRow[] {
  if (!form.startDate) {
    throw new Error("Enter the lease start date first");
  }
  if (!date) {
    throw new Error("Enter the date the new rent starts");
  }
  if (date <= form.startDate) {
    throw new Error("The new rent must start after the lease start date");
  }

  let amountCents: number;
  if (mode === "amount") {
    amountCents = parseAmount(value, "new rent");
  } else {
    const steps = form.rentSteps.map((step, index) =>
      index === 0 ? { ...step, startsOn: form.startDate } : step,
    );
    const previous = stepOn(steps, addDays(date, -1));
    if (!previous) {
      throw new Error("No rent is in effect the day before that date");
    }
    const bps = parsePercentBps(value);
    if (bps <= -10000) {
      throw new Error("The percentage must be above -100");
    }
    amountCents = prorate(
      parseAmount(previous.amount, "current rent"),
      [10000 + bps],
      [10000],
    );
  }

  const amount = centsToInput(amountCents);
  const existing = form.rentSteps.find((step) => step.startsOn === date);
  const steps = existing
    ? form.rentSteps.map((step) =>
        step === existing ? { ...step, amount } : step,
      )
    : [...form.rentSteps, { key: newRowKey(), startsOn: date, amount }];
  const [first, ...rest] = steps;
  if (!first) return steps;
  return [first, ...rest.sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))];
}

export function toLeaseInput(
  form: LeaseFormState,
  pools: readonly PoolOption[],
): LeaseInput {
  const poolName = (poolId: string) =>
    pools.find((pool) => pool.id === poolId)?.name ?? "the other pool";

  const estimates = Object.entries(form.estimates)
    .filter(([, estimate]) => estimate.pays)
    .map(([poolId, estimate]) => {
      if (estimate.steps.length === 0) {
        throw new Error(`Add an estimate for ${poolName(poolId)}`);
      }
      return {
        poolId,
        steps: estimate.steps.map((step) => {
          if (!step.startsOn) {
            throw new Error(`Enter a date for each ${poolName(poolId)} step`);
          }
          return {
            startsOn: step.startsOn,
            amountCents: parseAmount(
              step.amount,
              `${poolName(poolId)} estimate`,
            ),
          };
        }),
      };
    });

  let lateFee: LeaseInput["lateFee"] = null;
  if (form.hasLateFee) {
    const day = Number(form.lateFeeDay);
    if (!Number.isInteger(day) || day < 1 || day > 27) {
      throw new Error("The late fee day must be between 1 and 27");
    }
    const amountCents = parseAmount(form.lateFeeAmount, "late fee");
    if (amountCents === 0) {
      throw new Error("The late fee must be above zero");
    }
    lateFee = { amountCents, day };
  }

  return {
    startDate: form.startDate,
    endDate: form.endDate,
    moveOutDate: form.moveOutDate || null,
    rentSteps: form.rentSteps.map((step, index) => {
      const startsOn = index === 0 ? form.startDate : step.startsOn;
      if (!startsOn) {
        throw new Error("Enter a date for each rent step");
      }
      return {
        id: step.id,
        startsOn,
        amountCents: parseAmount(step.amount, "base rent"),
      };
    }),
    estimates,
    lateFee,
    insuranceExpiresOn: form.insuranceExpiresOn || null,
  };
}
