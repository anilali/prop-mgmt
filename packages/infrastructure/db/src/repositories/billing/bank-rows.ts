import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";

import type {
  BankAccount,
  DedupeRange,
  DedupeState,
  ImportBatch,
  ImportBatchSummary,
  TransactionSource,
  Txn,
} from "@moonship/billing";
import { dedupeKey } from "@moonship/billing";

import type { DbExecutor } from "../../client";
import type { bankAccounts } from "../../schemas/billing/schema";
import {
  importBatches,
  transactionAllocations,
  transactions,
} from "../../schemas/billing/schema";

export function toBankAccount(
  row: typeof bankAccounts.$inferSelect,
): BankAccount {
  return {
    id: row.id,
    propertyId: row.propertyId,
    name: row.name,
    csvMapping: row.csvMapping ?? null,
  };
}

export function toImportBatch(
  row: typeof importBatches.$inferSelect,
): ImportBatch {
  return {
    id: row.id,
    propertyId: row.propertyId,
    bankAccountId: row.bankAccountId,
    fileName: row.fileName,
    importedAt: row.importedAt,
    rowCount: row.rowCount,
    insertedCount: row.insertedCount,
    duplicateCount: row.duplicateCount,
    beforeTrackingStartCount: row.beforeTrackingStartCount,
    notTransactionCount: row.notTransactionCount,
    firstPostedOn: row.firstPostedOn,
    lastPostedOn: row.lastPostedOn,
  };
}

export async function loadTransactions(
  db: DbExecutor,
  propertyId: string,
  ids?: string[],
): Promise<Txn[]> {
  if (ids?.length === 0) return [];
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.propertyId, propertyId),
        ids ? inArray(transactions.id, ids) : undefined,
      ),
    )
    .orderBy(
      asc(transactions.postedOn),
      asc(transactions.createdAt),
      asc(transactions.id),
    );
  if (rows.length === 0) return [];
  const lineRows = await db
    .select()
    .from(transactionAllocations)
    .where(
      and(
        eq(transactionAllocations.propertyId, propertyId),
        ids ? inArray(transactionAllocations.transactionId, ids) : undefined,
      ),
    )
    .orderBy(
      desc(transactionAllocations.amountCents),
      asc(transactionAllocations.id),
    );
  const linesByTxn = new Map<string, Txn["lines"]>();
  for (const line of lineRows) {
    const list = linesByTxn.get(line.transactionId) ?? [];
    list.push({
      accountId: line.accountId,
      categoryId: line.categoryId,
      amountCents: line.amountCents,
    });
    linesByTxn.set(line.transactionId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.propertyId,
    source: row.source as TransactionSource,
    importBatchId: row.importBatchId,
    postedOn: row.postedOn,
    description: row.description,
    descriptionKey: row.descriptionKey,
    amountCents: row.amountCents,
    externalId: row.externalId,
    lines: linesByTxn.get(row.id) ?? [],
  }));
}

export async function loadDedupeState(
  db: DbExecutor,
  propertyId: string,
  bankAccountId: string,
  range: DedupeRange,
): Promise<DedupeState> {
  const countRows = await db
    .select({
      postedOn: transactions.postedOn,
      descriptionKey: transactions.descriptionKey,
      amountCents: transactions.amountCents,
      total: count(),
      withoutId: count(
        sql`case when ${transactions.externalId} is null then 1 end`,
      ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.propertyId, propertyId),
        eq(transactions.bankAccountId, bankAccountId),
        between(transactions.postedOn, range.from, range.to),
      ),
    )
    .groupBy(
      transactions.postedOn,
      transactions.descriptionKey,
      transactions.amountCents,
    );
  const idRows =
    range.externalIds.length === 0
      ? []
      : await db
          .select({
            externalId: transactions.externalId,
            postedOn: transactions.postedOn,
            descriptionKey: transactions.descriptionKey,
            amountCents: transactions.amountCents,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.propertyId, propertyId),
              eq(transactions.bankAccountId, bankAccountId),
              isNotNull(transactions.externalId),
              inArray(transactions.externalId, range.externalIds),
            ),
          );
  return {
    externalIds: new Map(
      idRows.flatMap((row) =>
        row.externalId ? [[row.externalId, dedupeKey(row)] as const] : [],
      ),
    ),
    counts: new Map(
      countRows.map((row) => [
        dedupeKey(row),
        { total: row.total, withoutId: row.withoutId },
      ]),
    ),
  };
}

export async function loadImportBatches(
  db: DbExecutor,
  propertyId: string,
  batchId?: string,
): Promise<ImportBatchSummary[]> {
  const rows = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.propertyId, propertyId),
        batchId ? eq(importBatches.id, batchId) : undefined,
      ),
    )
    .orderBy(desc(importBatches.importedAt), desc(importBatches.id));
  if (rows.length === 0) return [];
  const sortedRows = await db
    .selectDistinct({
      importBatchId: transactions.importBatchId,
      transactionId: transactionAllocations.transactionId,
    })
    .from(transactionAllocations)
    .innerJoin(
      transactions,
      eq(transactions.id, transactionAllocations.transactionId),
    )
    .where(
      and(
        eq(transactions.propertyId, propertyId),
        inArray(
          transactions.importBatchId,
          rows.map((row) => row.id),
        ),
      ),
    );
  return rows.map((row) => ({
    ...toImportBatch(row),
    sortedCount: sortedRows.filter((s) => s.importBatchId === row.id).length,
  }));
}
