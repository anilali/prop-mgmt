import { and, asc, eq } from "drizzle-orm";

import type {
  PoolBillOverride,
  ReconciliationStatus,
  ReconciliationYear,
} from "@moonship/billing";

import type { DbExecutor } from "../../client";
import {
  poolBillOverrides,
  reconciliationYears,
} from "../../schemas/billing/schema";

export function toReconciliationYear(
  row: typeof reconciliationYears.$inferSelect,
): ReconciliationYear {
  return {
    id: row.id,
    propertyId: row.propertyId,
    year: row.year,
    status: row.status as ReconciliationStatus,
    letterDate: row.letterDate,
    finalizedAt: row.finalizedAt,
  };
}

export function toPoolBillOverride(
  row: typeof poolBillOverrides.$inferSelect,
  year: number,
): PoolBillOverride {
  return {
    id: row.id,
    propertyId: row.propertyId,
    reconciliationYearId: row.reconciliationYearId,
    year,
    poolId: row.poolId,
    amountCents: row.amountCents,
    note: row.note,
  };
}

export async function loadReconciliationYears(
  db: DbExecutor,
  propertyId: string,
): Promise<ReconciliationYear[]> {
  const rows = await db
    .select()
    .from(reconciliationYears)
    .where(eq(reconciliationYears.propertyId, propertyId))
    .orderBy(asc(reconciliationYears.year));
  return rows.map(toReconciliationYear);
}

export async function loadBillOverrides(
  db: DbExecutor,
  propertyId: string,
): Promise<PoolBillOverride[]> {
  const rows = await db
    .select({ override: poolBillOverrides, year: reconciliationYears.year })
    .from(poolBillOverrides)
    .innerJoin(
      reconciliationYears,
      eq(reconciliationYears.id, poolBillOverrides.reconciliationYearId),
    )
    .where(
      and(
        eq(poolBillOverrides.propertyId, propertyId),
        eq(reconciliationYears.propertyId, propertyId),
      ),
    )
    .orderBy(asc(reconciliationYears.year), asc(poolBillOverrides.createdAt));
  return rows.map((row) => toPoolBillOverride(row.override, row.year));
}
