import { and, eq } from "drizzle-orm";

import type {
  BankAccount,
  BillingQueries,
  Category,
  DedupeRange,
  DedupeState,
  ImportBatchSummary,
  Pool,
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
import {
  bankAccounts,
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

  hasTransactionsOrLedgerEntries(propertyId: string): Promise<boolean> {
    return this.hasTransactions(propertyId);
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
    return rows.length > 0;
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
}
