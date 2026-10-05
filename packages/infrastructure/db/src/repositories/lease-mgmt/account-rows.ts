import { asc, inArray } from "drizzle-orm";

import type { AccountView, Lease } from "@moonship/lease-mgmt";

import type { DbExecutor } from "../../client";
import type { accounts } from "../../schemas/lease-mgmt/schema";
import {
  leaseEstimateSteps,
  leaseRentSteps,
  leases,
} from "../../schemas/lease-mgmt/schema";

export async function loadLeases(
  db: DbExecutor,
  accountIds: string[],
): Promise<Map<string, Lease[]>> {
  const byAccount = new Map<string, Lease[]>();
  if (accountIds.length === 0) return byAccount;

  const leaseRows = await db
    .select()
    .from(leases)
    .where(inArray(leases.accountId, accountIds))
    .orderBy(asc(leases.startDate));
  if (leaseRows.length === 0) return byAccount;

  const leaseIds = leaseRows.map((row) => row.id);
  const rentRows = await db
    .select()
    .from(leaseRentSteps)
    .where(inArray(leaseRentSteps.leaseId, leaseIds))
    .orderBy(asc(leaseRentSteps.startsOn));
  const estimateRows = await db
    .select()
    .from(leaseEstimateSteps)
    .where(inArray(leaseEstimateSteps.leaseId, leaseIds))
    .orderBy(asc(leaseEstimateSteps.startsOn), asc(leaseEstimateSteps.poolId));

  for (const row of leaseRows) {
    const lease: Lease = {
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      moveOutDate: row.moveOutDate,
      lateFee:
        row.lateFeeCents !== null && row.lateFeeDay !== null
          ? { amountCents: row.lateFeeCents, day: row.lateFeeDay }
          : null,
      insuranceExpiresOn: row.insuranceExpiresOn,
      rentSteps: rentRows
        .filter((step) => step.leaseId === row.id)
        .map((step) => ({
          id: step.id,
          startsOn: step.startsOn,
          amountCents: step.amountCents,
          tenantNotifiedAt: step.tenantNotifiedAt,
        })),
      estimateSteps: estimateRows
        .filter((step) => step.leaseId === row.id)
        .map((step) => ({
          id: step.id,
          poolId: step.poolId,
          startsOn: step.startsOn,
          amountCents: step.amountCents,
        })),
    };
    const list = byAccount.get(row.accountId) ?? [];
    list.push(lease);
    byAccount.set(row.accountId, list);
  }
  return byAccount;
}

export function toAccountView(
  row: typeof accounts.$inferSelect,
  leasesByAccount: Map<string, Lease[]>,
): AccountView {
  return {
    id: row.id,
    propertyId: row.propertyId,
    tenantId: row.tenantId,
    unitId: row.unitId,
    openingBalanceCents: row.openingBalanceCents,
    leases: leasesByAccount.get(row.id) ?? [],
  };
}
