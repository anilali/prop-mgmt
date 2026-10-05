import { randomUUID } from "node:crypto";

import type {
  AccountState,
  AccountTerms,
  BillingQueries,
} from "@moonship/billing";
import type {
  Account,
  AccountQueries,
  AccountRepository,
  AccountView,
  Lease,
  LeaseTermsInput,
} from "@moonship/lease-mgmt";
import type { PropertyQueries, UnitQueries } from "@moonship/property";
import type { IsoDate } from "@moonship/shared";
import type { TenantQueries } from "@moonship/tenant-mgmt";
import {
  accountEnd,
  accountsOverlap,
  accountStart,
  accountState,
} from "@moonship/billing";
import { StaleAccountError } from "@moonship/lease-mgmt";

import type { LeaseInput } from "./schemas";
import { badRequest, conflict, notFound } from "./errors";
import { loadProperty } from "./property-context";

export function assertAccountVersion(
  account: Account,
  expectedVersion: number,
): void {
  try {
    account.assertVersion(expectedVersion);
  } catch (e) {
    if (e instanceof StaleAccountError) throw conflict(e.message);
    throw e;
  }
}

export async function saveAccount(
  repository: AccountRepository,
  account: Account,
): Promise<void> {
  try {
    await repository.save(account);
  } catch (e) {
    if (e instanceof StaleAccountError) throw conflict(e.message);
    throw e;
  }
}

export interface AccountDeps {
  accountQueries: AccountQueries;
  tenantQueries: TenantQueries;
  unitQueries: UnitQueries;
  propertyQueries: PropertyQueries;
  billingQueries: BillingQueries;
}

export interface AccountSummary {
  id: string;
  tenant: { id: string; businessName: string };
  unit: { id: string; label: string };
  openingBalanceCents: number;
  version: number;
  state: AccountState;
  startDate: IsoDate;
  endDate: IsoDate | null;
  leases: Lease[];
}

export function toAccountTerms(account: AccountView | Account): AccountTerms {
  return {
    accountId: account.id,
    tenantId: account.tenantId,
    unitId: account.unitId,
    openingBalanceCents: account.openingBalanceCents,
    leases: account.leases.map((lease) => ({
      leaseId: lease.id,
      startDate: lease.startDate,
      endDate: lease.endDate,
      moveOutDate: lease.moveOutDate,
      lateFee: lease.lateFee,
      insuranceExpiresOn: lease.insuranceExpiresOn,
      rentSteps: lease.rentSteps,
      estimateSteps: lease.estimateSteps,
      fixedChargeSteps: lease.fixedChargeSteps,
    })),
  };
}

export function toLeaseTerms(
  input: LeaseInput,
  existing: Lease | null,
): LeaseTermsInput {
  const existingStepIds = new Set(
    existing?.rentSteps.map((step) => step.id) ?? [],
  );
  const existingChargeStepIds = new Set(
    existing?.fixedChargeSteps.map((step) => step.id) ?? [],
  );
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    moveOutDate: input.moveOutDate ?? null,
    lateFee: input.lateFee ?? null,
    insuranceExpiresOn: input.insuranceExpiresOn ?? null,
    rentSteps: input.rentSteps.map((step) => ({
      id: step.id && existingStepIds.has(step.id) ? step.id : randomUUID(),
      startsOn: step.startsOn,
      amountCents: step.amountCents,
    })),
    estimateSteps: input.estimates.flatMap((estimate) =>
      estimate.steps.map((step) => ({
        id: randomUUID(),
        poolId: estimate.poolId,
        startsOn: step.startsOn,
        amountCents: step.amountCents,
      })),
    ),
    fixedChargeSteps: input.fixedCharges.flatMap((charge) =>
      charge.steps.map((step) => ({
        id:
          step.id && existingChargeStepIds.has(step.id)
            ? step.id
            : randomUUID(),
        name: charge.name,
        startsOn: step.startsOn,
        amountCents: step.amountCents,
      })),
    ),
  };
}

function leaseTermsKey(lease: Lease): string {
  return JSON.stringify([
    lease.startDate,
    lease.endDate,
    lease.moveOutDate,
    lease.lateFee?.amountCents ?? null,
    lease.lateFee?.day ?? null,
    lease.insuranceExpiresOn,
    lease.rentSteps.map((step) => [step.startsOn, step.amountCents]),
    lease.estimateSteps.map((step) => [
      step.poolId,
      step.startsOn,
      step.amountCents,
    ]),
    lease.fixedChargeSteps.map((step) => [
      step.name,
      step.startsOn,
      step.amountCents,
    ]),
  ]);
}

function addedOrChangedLeases(account: Account, stored: Lease[]): Lease[] {
  return account.leases.filter((lease) => {
    const before = stored.find((s) => s.id === lease.id);
    return !before || leaseTermsKey(before) !== leaseTermsKey(lease);
  });
}

export async function assertAccountRules(
  deps: AccountDeps,
  propertyId: string,
  account: Account,
  storedLeases: Lease[],
): Promise<void> {
  const terms = toAccountTerms(account);
  const { property } = await loadProperty(deps.propertyQueries, propertyId);

  if (account.openingBalanceCents !== 0) {
    const trackingStart = property.trackingStartDate;
    if (trackingStart === null) {
      throw badRequest(
        "Set the tracking start date before entering an opening balance",
      );
    }
    if (accountStart(terms) > trackingStart) {
      throw badRequest(
        "Only an account that starts on or before the tracking start date can have an opening balance. Use an adjustment instead.",
      );
    }
  }

  const others = (await deps.accountQueries.list(propertyId)).filter(
    (other) => other.unitId === account.unitId && other.id !== account.id,
  );
  if (others.some((other) => accountsOverlap(terms, toAccountTerms(other)))) {
    throw conflict(
      "Another account on this unit overlaps these dates. Enter a move-out date on the other account first.",
    );
  }

  const pools = await deps.billingQueries.listPools(propertyId);
  const poolIds = new Set(
    addedOrChangedLeases(account, storedLeases).flatMap((lease) =>
      lease.estimateSteps.map((step) => step.poolId),
    ),
  );
  for (const poolId of poolIds) {
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) {
      throw badRequest(`Pool not found: ${poolId}`);
    }
    if (!pool.unitIds.includes(account.unitId)) {
      throw badRequest(
        `The account's unit is not in the ${pool.name} pool. Add the unit to the pool first.`,
      );
    }
  }
}

export async function listAccountSummaries(
  deps: AccountDeps,
  propertyId: string,
  today: IsoDate,
): Promise<AccountSummary[]> {
  const [views, tenants, units] = await Promise.all([
    deps.accountQueries.list(propertyId),
    deps.tenantQueries.list(propertyId),
    deps.unitQueries.list(propertyId),
  ]);
  return views
    .map((view) => toSummary(view, today, tenants, units))
    .sort(
      (a, b) =>
        a.unit.label.localeCompare(b.unit.label, undefined, {
          numeric: true,
        }) || (a.startDate < b.startDate ? -1 : 1),
    );
}

export async function getAccountDetail(
  deps: AccountDeps,
  propertyId: string,
  accountId: string,
) {
  const { today } = await loadProperty(deps.propertyQueries, propertyId);
  const view = await deps.accountQueries.getById(propertyId, accountId);
  if (!view) throw notFound("Account not found");
  const [tenants, units, pools] = await Promise.all([
    deps.tenantQueries.list(propertyId),
    deps.unitQueries.list(propertyId),
    deps.billingQueries.listPools(propertyId),
  ]);
  return {
    today,
    account: toSummary(view, today, tenants, units),
    unitPools: pools
      .filter((pool) => pool.unitIds.includes(view.unitId))
      .map((pool) => ({ id: pool.id, name: pool.name })),
  };
}

function toSummary(
  view: AccountView,
  today: IsoDate,
  tenants: { id: string; businessName: string }[],
  units: { id: string; label: string }[],
): AccountSummary {
  const terms = toAccountTerms(view);
  const tenant = tenants.find((t) => t.id === view.tenantId);
  const unit = units.find((u) => u.id === view.unitId);
  return {
    id: view.id,
    tenant: { id: view.tenantId, businessName: tenant?.businessName ?? "" },
    unit: { id: view.unitId, label: unit?.label ?? "" },
    openingBalanceCents: view.openingBalanceCents,
    version: view.version,
    state: accountState(terms, today),
    startDate: accountStart(terms),
    endDate: accountEnd(terms),
    leases: view.leases,
  };
}
