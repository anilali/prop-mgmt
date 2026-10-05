import { and, asc, eq } from "drizzle-orm";

import type {
  PoolBillOverride,
  ReconciliationSource,
  ReconciliationStatus,
  ReconciliationYear,
  RecordedPoolLine,
  StatementSnapshot,
  TransactionSource,
} from "@moonship/billing";

import type { DbExecutor } from "../../client";
import {
  poolBillOverrides,
  reconciliationStatements,
  reconciliationYears,
  recordedPoolLines,
} from "../../schemas/billing/schema";

export function toReconciliationYear(
  row: typeof reconciliationYears.$inferSelect,
): ReconciliationYear {
  return {
    id: row.id,
    propertyId: row.propertyId,
    year: row.year,
    status: row.status as ReconciliationStatus,
    source: row.source as ReconciliationSource,
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

export function toStatementSnapshot(
  row: typeof reconciliationStatements.$inferSelect,
  year: number,
): StatementSnapshot {
  return {
    id: row.id,
    propertyId: row.propertyId,
    reconciliationYearId: row.reconciliationYearId,
    year,
    accountId: row.accountId,
    tenantId: row.tenantId,
    data: row.data,
    trueUpCents: row.trueUpCents,
    balanceOnAccountCents: row.balanceOnAccountCents,
    pdfStorageKey: row.pdfStorageKey,
    createdAt: row.createdAt,
  };
}

export async function loadStatementSnapshots(
  db: DbExecutor,
  propertyId: string,
): Promise<StatementSnapshot[]> {
  const rows = await db
    .select({
      snapshot: reconciliationStatements,
      year: reconciliationYears.year,
    })
    .from(reconciliationStatements)
    .innerJoin(
      reconciliationYears,
      eq(reconciliationYears.id, reconciliationStatements.reconciliationYearId),
    )
    .where(
      and(
        eq(reconciliationStatements.propertyId, propertyId),
        eq(reconciliationYears.propertyId, propertyId),
      ),
    )
    .orderBy(
      asc(reconciliationYears.year),
      asc(reconciliationStatements.createdAt),
    );
  return rows.map((row) => toStatementSnapshot(row.snapshot, row.year));
}

export function toRecordedPoolLine(
  row: typeof recordedPoolLines.$inferSelect,
  year: number,
): RecordedPoolLine {
  return {
    id: row.id,
    propertyId: row.propertyId,
    reconciliationYearId: row.reconciliationYearId,
    year,
    poolId: row.poolId,
    postedOn: row.postedOn,
    description: row.description,
    source: row.source as TransactionSource,
    costCents: row.costCents,
  };
}

export async function loadRecordedPoolLines(
  db: DbExecutor,
  propertyId: string,
): Promise<RecordedPoolLine[]> {
  const rows = await db
    .select({ line: recordedPoolLines, year: reconciliationYears.year })
    .from(recordedPoolLines)
    .innerJoin(
      reconciliationYears,
      eq(reconciliationYears.id, recordedPoolLines.reconciliationYearId),
    )
    .where(
      and(
        eq(recordedPoolLines.propertyId, propertyId),
        eq(reconciliationYears.propertyId, propertyId),
      ),
    )
    .orderBy(
      asc(reconciliationYears.year),
      asc(recordedPoolLines.postedOn),
      asc(recordedPoolLines.description),
    );
  return rows.map((row) => toRecordedPoolLine(row.line, row.year));
}
