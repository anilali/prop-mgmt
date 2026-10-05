import { and, eq } from "drizzle-orm";

import type {
  BankAccount,
  BillingQueries,
  Category,
  DedupeRange,
  DedupeState,
  ImportBatchSummary,
  LedgerEntry,
  Pool,
  PoolBillOverride,
  ReconciliationYear,
  Txn,
} from "@moonship/billing";

import type { DbExecutor } from "../../client";
import {
  loadDedupeState,
  loadImportBatches,
  loadTransactions,
  toBankAccount,
} from "../../repositories/billing/bank-rows";
import {
  loadCategories,
  loadPools,
} from "../../repositories/billing/billing-rows";
import { loadLedgerEntries } from "../../repositories/billing/ledger-rows";
import {
  loadBillOverrides,
  loadReconciliationYears,
} from "../../repositories/billing/reconciliation-rows";
import {
  accountLedgerEntries,
  bankAccounts,
  reconciliationYears,
  transactionAllocations,
  transactions,
} from "../../schemas/billing/schema";

export class PGBillingQueries implements BillingQueries {
  constructor(private db: DbExecutor) {}

  listPools(propertyId: string): Promise<Pool[]> {
    return loadPools(this.db, propertyId);
  }

  listCategories(propertyId: string): Promise<Category[]> {
    return loadCategories(this.db, propertyId);
  }

  async hasTransactions(propertyId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.propertyId, propertyId))
      .limit(1);
    return rows.length > 0;
  }

  async hasTransactionsOrLedgerEntries(propertyId: string): Promise<boolean> {
    if (await this.hasTransactions(propertyId)) return true;
    const rows = await this.db
      .select({ id: accountLedgerEntries.id })
      .from(accountLedgerEntries)
      .where(eq(accountLedgerEntries.propertyId, propertyId))
      .limit(1);
    return rows.length > 0;
  }

  async categoryHasAllocations(
    propertyId: string,
    categoryId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: transactionAllocations.id })
      .from(transactionAllocations)
      .where(
        and(
          eq(transactionAllocations.propertyId, propertyId),
          eq(transactionAllocations.categoryId, categoryId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async accountHasActivity(
    propertyId: string,
    accountId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: transactionAllocations.id })
      .from(transactionAllocations)
      .where(
        and(
          eq(transactionAllocations.propertyId, propertyId),
          eq(transactionAllocations.accountId, accountId),
        ),
      )
      .limit(1);
    if (rows.length > 0) return true;
    const entries = await this.db
      .select({ id: accountLedgerEntries.id })
      .from(accountLedgerEntries)
      .where(
        and(
          eq(accountLedgerEntries.propertyId, propertyId),
          eq(accountLedgerEntries.accountId, accountId),
        ),
      )
      .limit(1);
    return entries.length > 0;
  }

  async getBankAccount(propertyId: string): Promise<BankAccount | null> {
    const row = await this.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.propertyId, propertyId))
      .limit(1)
      .then((rows) => rows[0]);
    return row ? toBankAccount(row) : null;
  }

  loadDedupeState(
    propertyId: string,
    bankAccountId: string,
    range: DedupeRange,
  ): Promise<DedupeState> {
    return loadDedupeState(this.db, propertyId, bankAccountId, range);
  }

  listImportBatches(propertyId: string): Promise<ImportBatchSummary[]> {
    return loadImportBatches(this.db, propertyId);
  }

  listTransactions(propertyId: string): Promise<Txn[]> {
    return loadTransactions(this.db, propertyId);
  }

  async getTransaction(propertyId: string, id: string): Promise<Txn | null> {
    const [txn] = await loadTransactions(this.db, propertyId, [id]);
    return txn ?? null;
  }

  listLedgerEntries(propertyId: string): Promise<LedgerEntry[]> {
    return loadLedgerEntries(this.db, propertyId);
  }

  async getLedgerEntry(
    propertyId: string,
    id: string,
  ): Promise<LedgerEntry | null> {
    const [entry] = await loadLedgerEntries(this.db, propertyId, id);
    return entry ?? null;
  }

  async listFinalizedYears(propertyId: string): Promise<number[]> {
    const rows = await this.db
      .select({ year: reconciliationYears.year })
      .from(reconciliationYears)
      .where(
        and(
          eq(reconciliationYears.propertyId, propertyId),
          eq(reconciliationYears.status, "finalized"),
        ),
      );
    return rows.map((row) => row.year);
  }

  listReconciliationYears(propertyId: string): Promise<ReconciliationYear[]> {
    return loadReconciliationYears(this.db, propertyId);
  }

  listBillOverrides(propertyId: string): Promise<PoolBillOverride[]> {
    return loadBillOverrides(this.db, propertyId);
  }
}
