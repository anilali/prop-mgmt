import { and, asc, eq } from "drizzle-orm";

import type { LedgerEntry, LedgerEntryKind } from "@moonship/billing";

import type { DbExecutor } from "../../client";
import { accountLedgerEntries } from "../../schemas/billing/schema";

export function toLedgerEntry(
  row: typeof accountLedgerEntries.$inferSelect,
): LedgerEntry {
  return {
    id: row.id,
    propertyId: row.propertyId,
    accountId: row.accountId,
    kind: row.kind as LedgerEntryKind,
    entryDate: row.entryDate,
    amountCents: row.amountCents,
    note: row.note,
    feeMonth: row.feeMonth,
    reconciliationYearId: row.reconciliationYearId,
  };
}

export async function loadLedgerEntries(
  db: DbExecutor,
  propertyId: string,
  id?: string,
): Promise<LedgerEntry[]> {
  const rows = await db
    .select()
    .from(accountLedgerEntries)
    .where(
      and(
        eq(accountLedgerEntries.propertyId, propertyId),
        id ? eq(accountLedgerEntries.id, id) : undefined,
      ),
    )
    .orderBy(
      asc(accountLedgerEntries.entryDate),
      asc(accountLedgerEntries.createdAt),
      asc(accountLedgerEntries.id),
    );
  return rows.map(toLedgerEntry);
}
