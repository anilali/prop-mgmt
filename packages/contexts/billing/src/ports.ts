import type { IsoDate } from "@moonship/shared";

import type { DedupeState } from "./csv-import";
import type { StatementData } from "./statement-document";
import type {
  AllocationLine,
  BankAccount,
  CashExpense,
  Category,
  CsvMapping,
  ImportBatch,
  LedgerEntry,
  NewBankTransaction,
  Pool,
  PoolBillOverride,
  ReconciliationYear,
  Txn,
} from "./types";

export interface DedupeRange {
  from: IsoDate;
  to: IsoDate;
  externalIds: string[];
}

export interface ImportBatchSummary extends ImportBatch {
  sortedCount: number;
}

export interface BillingStore {
  listPools(propertyId: string): Promise<Pool[]>;
  listCategories(propertyId: string): Promise<Category[]>;
  savePool(pool: Pool): Promise<void>;
  deletePool(propertyId: string, poolId: string): Promise<void>;
  saveCategory(category: Category): Promise<void>;
  removeUnitFromPools(
    propertyId: string,
    unitId: string,
    changedOn: IsoDate | null,
  ): Promise<void>;
  lockBankAccount(propertyId: string): Promise<BankAccount>;
  loadDedupeState(
    propertyId: string,
    bankAccountId: string,
    range: DedupeRange,
  ): Promise<DedupeState>;
  saveCsvMapping(
    propertyId: string,
    bankAccountId: string,
    mapping: CsvMapping,
  ): Promise<void>;
  insertImportBatch(
    batch: ImportBatch,
    transactions: NewBankTransaction[],
  ): Promise<void>;
  lockImportBatch(
    propertyId: string,
    batchId: string,
  ): Promise<ImportBatchSummary | null>;
  deleteImportBatch(propertyId: string, batchId: string): Promise<void>;
  replaceAllocations(
    propertyId: string,
    transactionId: string,
    lines: AllocationLine[],
  ): Promise<Txn | null>;
  insertCashExpense(expense: CashExpense): Promise<Txn>;
  updateCashExpense(expense: CashExpense): Promise<Txn | null>;
  deleteCashExpense(propertyId: string, id: string): Promise<boolean>;
  insertLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry>;
  updateLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry | null>;
  deleteLedgerEntry(propertyId: string, id: string): Promise<boolean>;
  lockYear(propertyId: string, year: number): Promise<ReconciliationYear>;
  saveYear(year: ReconciliationYear): Promise<ReconciliationYear>;
  saveBillOverride(override: PoolBillOverride): Promise<PoolBillOverride>;
  deleteBillOverride(
    propertyId: string,
    reconciliationYearId: string,
    poolId: string,
  ): Promise<boolean>;
}

export interface BillingQueries {
  listPools(propertyId: string): Promise<Pool[]>;
  listCategories(propertyId: string): Promise<Category[]>;
  hasTransactions(propertyId: string): Promise<boolean>;
  hasTransactionsOrLedgerEntries(propertyId: string): Promise<boolean>;
  categoryHasAllocations(
    propertyId: string,
    categoryId: string,
  ): Promise<boolean>;
  accountHasActivity(propertyId: string, accountId: string): Promise<boolean>;
  getBankAccount(propertyId: string): Promise<BankAccount | null>;
  loadDedupeState(
    propertyId: string,
    bankAccountId: string,
    range: DedupeRange,
  ): Promise<DedupeState>;
  listImportBatches(propertyId: string): Promise<ImportBatchSummary[]>;
  listTransactions(propertyId: string): Promise<Txn[]>;
  getTransaction(propertyId: string, id: string): Promise<Txn | null>;
  listLedgerEntries(propertyId: string): Promise<LedgerEntry[]>;
  getLedgerEntry(propertyId: string, id: string): Promise<LedgerEntry | null>;
  listFinalizedYears(propertyId: string): Promise<number[]>;
  listReconciliationYears(propertyId: string): Promise<ReconciliationYear[]>;
  listBillOverrides(propertyId: string): Promise<PoolBillOverride[]>;
}

export interface StatementRenderer {
  render(data: StatementData): Promise<Uint8Array>;
}
