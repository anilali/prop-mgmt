import { and, eq, inArray } from "drizzle-orm";

import type {
  AllocationLine,
  BankAccount,
  BillingStore,
  CashExpense,
  Category,
  CsvMapping,
  DedupeRange,
  DedupeState,
  ImportBatch,
  ImportBatchSummary,
  LedgerEntry,
  NewBankTransaction,
  Pool,
  Txn,
} from "@moonship/billing";
import type { IsoDate } from "@moonship/shared";
import {
  checkAllocationLines,
  checkLedgerEntry,
  descriptionKey,
} from "@moonship/billing";

import type { DbExecutor } from "../../client";
import {
  accountLedgerEntries,
  bankAccounts,
  categories,
  costPools,
  costPoolUnits,
  importBatches,
  transactionAllocations,
  transactions,
} from "../../schemas/billing/schema";
import {
  loadDedupeState,
  loadImportBatches,
  loadTransactions,
  toBankAccount,
} from "./bank-rows";
import { loadCategories, loadPools } from "./billing-rows";
import { toLedgerEntry } from "./ledger-rows";

const INSERT_CHUNK = 1000;

export class PGBillingStore implements BillingStore {
  constructor(private db: DbExecutor) {}

  listPools(propertyId: string): Promise<Pool[]> {
    return loadPools(this.db, propertyId);
  }

  listCategories(propertyId: string): Promise<Category[]> {
    return loadCategories(this.db, propertyId);
  }

  async savePool(pool: Pool): Promise<void> {
    await this.db.transaction(async (tx) => {
      const values = {
        name: pool.name,
        letterName: pool.letterName,
        addsNewUnits: pool.addsNewUnits,
        sortOrder: pool.sortOrder,
        membersChangedOn: pool.membersChangedOn,
      };
      const saved = await tx
        .insert(costPools)
        .values({ id: pool.id, propertyId: pool.propertyId, ...values })
        .onConflictDoUpdate({
          target: costPools.id,
          set: { ...values, updatedAt: new Date() },
          setWhere: eq(costPools.propertyId, pool.propertyId),
        })
        .returning({ id: costPools.id });
      if (saved.length === 0) {
        throw new Error(`Pool ${pool.id} belongs to another property`);
      }
      await tx.delete(costPoolUnits).where(eq(costPoolUnits.poolId, pool.id));
      if (pool.unitIds.length > 0) {
        await tx.insert(costPoolUnits).values(
          pool.unitIds.map((unitId) => ({
            poolId: pool.id,
            unitId,
            propertyId: pool.propertyId,
          })),
        );
      }
    });
  }

  async deletePool(propertyId: string, poolId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(categories)
        .where(
          and(
            eq(categories.propertyId, propertyId),
            eq(categories.poolId, poolId),
          ),
        );
      await tx
        .delete(costPools)
        .where(
          and(eq(costPools.propertyId, propertyId), eq(costPools.id, poolId)),
        );
    });
  }

  async saveCategory(category: Category): Promise<void> {
    const values = {
      name: category.name,
      kind: category.kind,
      poolId: category.poolId,
      archivedAt: category.archivedAt,
    };
    const saved = await this.db
      .insert(categories)
      .values({ id: category.id, propertyId: category.propertyId, ...values })
      .onConflictDoUpdate({
        target: categories.id,
        set: { ...values, updatedAt: new Date() },
        setWhere: eq(categories.propertyId, category.propertyId),
      })
      .returning({ id: categories.id });
    if (saved.length === 0) {
      throw new Error(`Category ${category.id} belongs to another property`);
    }
  }

  async removeUnitFromPools(
    propertyId: string,
    unitId: string,
    changedOn: IsoDate | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(costPoolUnits)
        .where(
          and(
            eq(costPoolUnits.propertyId, propertyId),
            eq(costPoolUnits.unitId, unitId),
          ),
        )
        .returning({ poolId: costPoolUnits.poolId });
      if (changedOn === null || removed.length === 0) return;
      await tx
        .update(costPools)
        .set({ membersChangedOn: changedOn, updatedAt: new Date() })
        .where(
          and(
            eq(costPools.propertyId, propertyId),
            inArray(
              costPools.id,
              removed.map((row) => row.poolId),
            ),
          ),
        );
    });
  }

  async lockBankAccount(propertyId: string): Promise<BankAccount> {
    await this.db
      .insert(bankAccounts)
      .values({ propertyId })
      .onConflictDoNothing({ target: bankAccounts.propertyId });
    const row = await this.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.propertyId, propertyId))
      .for("update")
      .then((rows) => rows[0]);
    if (!row) throw new Error(`No bank account for property ${propertyId}`);
    return toBankAccount(row);
  }

  loadDedupeState(
    propertyId: string,
    bankAccountId: string,
    range: DedupeRange,
  ): Promise<DedupeState> {
    return loadDedupeState(this.db, propertyId, bankAccountId, range);
  }

  async saveCsvMapping(
    propertyId: string,
    bankAccountId: string,
    mapping: CsvMapping,
  ): Promise<void> {
    await this.db
      .update(bankAccounts)
      .set({ csvMapping: mapping, updatedAt: new Date() })
      .where(
        and(
          eq(bankAccounts.id, bankAccountId),
          eq(bankAccounts.propertyId, propertyId),
        ),
      );
  }

  async insertImportBatch(
    batch: ImportBatch,
    rows: NewBankTransaction[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(importBatches).values({
        id: batch.id,
        propertyId: batch.propertyId,
        bankAccountId: batch.bankAccountId,
        fileName: batch.fileName,
        importedAt: batch.importedAt,
        rowCount: batch.rowCount,
        insertedCount: batch.insertedCount,
        duplicateCount: batch.duplicateCount,
        beforeTrackingStartCount: batch.beforeTrackingStartCount,
        notTransactionCount: batch.notTransactionCount,
        firstPostedOn: batch.firstPostedOn,
        lastPostedOn: batch.lastPostedOn,
      });
      for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
        await tx.insert(transactions).values(
          rows.slice(start, start + INSERT_CHUNK).map((row) => ({
            id: row.id,
            propertyId: batch.propertyId,
            source: "bank",
            bankAccountId: batch.bankAccountId,
            importBatchId: batch.id,
            postedOn: row.postedOn,
            description: row.description,
            descriptionKey: row.descriptionKey,
            amountCents: row.amountCents,
            externalId: row.externalId,
            rawRowHash: row.rawRowHash,
          })),
        );
      }
    });
  }

  async lockImportBatch(
    propertyId: string,
    batchId: string,
  ): Promise<ImportBatchSummary | null> {
    await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.propertyId, propertyId),
          eq(transactions.importBatchId, batchId),
        ),
      )
      .for("update");
    const [batch] = await loadImportBatches(this.db, propertyId, batchId);
    return batch ?? null;
  }

  async deleteImportBatch(propertyId: string, batchId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(transactions)
        .where(
          and(
            eq(transactions.propertyId, propertyId),
            eq(transactions.importBatchId, batchId),
          ),
        );
      await tx
        .delete(importBatches)
        .where(
          and(
            eq(importBatches.propertyId, propertyId),
            eq(importBatches.id, batchId),
          ),
        );
    });
  }

  async replaceAllocations(
    propertyId: string,
    transactionId: string,
    lines: AllocationLine[],
  ): Promise<Txn | null> {
    return this.db.transaction(async (tx) => {
      const row = await lockTransaction(tx, propertyId, transactionId);
      if (!row) return null;
      if (lines.length > 0) checkAllocationLines(row.amountCents, lines);
      await writeLines(tx, propertyId, transactionId, lines);
      return loadOne(tx, propertyId, transactionId);
    });
  }

  async insertCashExpense(expense: CashExpense): Promise<Txn> {
    return this.db.transaction(async (tx) => {
      await tx.insert(transactions).values({
        id: expense.id,
        propertyId: expense.propertyId,
        source: "cash",
        ...cashValues(expense),
      });
      await writeLines(tx, expense.propertyId, expense.id, [cashLine(expense)]);
      const txn = await loadOne(tx, expense.propertyId, expense.id);
      if (!txn) throw new Error(`Cash expense ${expense.id} was not saved`);
      return txn;
    });
  }

  async updateCashExpense(expense: CashExpense): Promise<Txn | null> {
    return this.db.transaction(async (tx) => {
      const row = await lockTransaction(tx, expense.propertyId, expense.id);
      if (row?.source !== "cash") return null;
      await tx
        .update(transactions)
        .set({ ...cashValues(expense), updatedAt: new Date() })
        .where(eq(transactions.id, expense.id));
      await writeLines(tx, expense.propertyId, expense.id, [cashLine(expense)]);
      return loadOne(tx, expense.propertyId, expense.id);
    });
  }

  async deleteCashExpense(propertyId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(transactions)
      .where(
        and(
          eq(transactions.id, id),
          eq(transactions.propertyId, propertyId),
          eq(transactions.source, "cash"),
        ),
      )
      .returning({ id: transactions.id });
    return deleted.length > 0;
  }

  async insertLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry> {
    checkLedgerEntry(entry);
    const [row] = await this.db
      .insert(accountLedgerEntries)
      .values({
        id: entry.id,
        propertyId: entry.propertyId,
        accountId: entry.accountId,
        kind: entry.kind,
        entryDate: entry.entryDate,
        amountCents: entry.amountCents,
        note: entry.note,
        feeMonth: entry.feeMonth,
        reconciliationYearId: entry.reconciliationYearId,
      })
      .returning();
    if (!row) throw new Error(`Ledger entry ${entry.id} was not saved`);
    return toLedgerEntry(row);
  }

  async updateLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry | null> {
    checkLedgerEntry(entry);
    const [row] = await this.db
      .update(accountLedgerEntries)
      .set({
        entryDate: entry.entryDate,
        amountCents: entry.amountCents,
        note: entry.note,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accountLedgerEntries.id, entry.id),
          eq(accountLedgerEntries.propertyId, entry.propertyId),
          eq(accountLedgerEntries.accountId, entry.accountId),
          eq(accountLedgerEntries.kind, entry.kind),
        ),
      )
      .returning();
    return row ? toLedgerEntry(row) : null;
  }

  async deleteLedgerEntry(propertyId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(accountLedgerEntries)
      .where(
        and(
          eq(accountLedgerEntries.id, id),
          eq(accountLedgerEntries.propertyId, propertyId),
        ),
      )
      .returning({ id: accountLedgerEntries.id });
    return deleted.length > 0;
  }
}

function cashValues(expense: CashExpense) {
  const description = expense.description.trim();
  return {
    postedOn: expense.postedOn,
    description,
    descriptionKey: descriptionKey(description),
    amountCents: -expense.amountCents,
  };
}

function cashLine(expense: CashExpense): AllocationLine {
  return {
    accountId: null,
    categoryId: expense.categoryId,
    amountCents: -expense.amountCents,
  };
}

async function lockTransaction(
  tx: DbExecutor,
  propertyId: string,
  transactionId: string,
) {
  const rows = await tx
    .select({
      id: transactions.id,
      source: transactions.source,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.propertyId, propertyId),
      ),
    )
    .for("update");
  return rows[0] ?? null;
}

async function writeLines(
  tx: DbExecutor,
  propertyId: string,
  transactionId: string,
  lines: AllocationLine[],
): Promise<void> {
  await tx
    .delete(transactionAllocations)
    .where(eq(transactionAllocations.transactionId, transactionId));
  if (lines.length === 0) return;
  await tx.insert(transactionAllocations).values(
    lines.map((line) => ({
      propertyId,
      transactionId,
      accountId: line.accountId,
      categoryId: line.categoryId,
      amountCents: line.amountCents,
    })),
  );
}

async function loadOne(
  tx: DbExecutor,
  propertyId: string,
  transactionId: string,
): Promise<Txn | null> {
  const [txn] = await loadTransactions(tx, propertyId, [transactionId]);
  return txn ?? null;
}
