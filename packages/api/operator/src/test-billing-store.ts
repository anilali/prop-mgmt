import { randomUUID } from "node:crypto";

import type {
  AllocationLine,
  BankAccount,
  BillingQueries,
  BillingStore,
  CashExpense,
  Category,
  CsvMapping,
  DedupeRange,
  DedupeState,
  ImportBatch,
  ImportBatchSummary,
  NewBankTransaction,
  Pool,
  StoredKeyCount,
  Txn,
} from "@moonship/billing";
import type {
  AccountProps,
  AccountQueries,
  AccountRepository,
  AccountView,
} from "@moonship/lease-mgmt";
import type { IsoDate } from "@moonship/shared";
import {
  checkAllocationLines,
  dedupeKey,
  descriptionKey,
} from "@moonship/billing";
import { Account } from "@moonship/lease-mgmt";

import type { TransactionalStores, UnitOfWork } from "./unit-of-work";

export interface Restorable {
  snapshot(): () => void;
}

export class InMemoryBillingStore
  implements BillingStore, BillingQueries, Restorable
{
  pools = new Map<string, Pool>();
  categories = new Map<string, Category>();
  transactionCount = 0;
  ledgerEntryCount = 0;
  allocatedCategoryIds = new Set<string>();
  accountIdsWithActivity = new Set<string>();
  failNextSave = false;
  bankAccounts = new Map<string, BankAccount>();
  importBatches = new Map<string, ImportBatch>();
  transactions = new Map<string, Txn>();

  listPools(propertyId: string): Promise<Pool[]> {
    return Promise.resolve(
      [...this.pools.values()]
        .filter((p) => p.propertyId === propertyId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => structuredClone(p)),
    );
  }

  listCategories(propertyId: string): Promise<Category[]> {
    return Promise.resolve(
      [...this.categories.values()]
        .filter((c) => c.propertyId === propertyId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => structuredClone(c)),
    );
  }

  savePool(pool: Pool): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error("Simulated store failure"));
    }
    this.pools.set(pool.id, structuredClone(pool));
    return Promise.resolve();
  }

  deletePool(propertyId: string, poolId: string): Promise<void> {
    for (const category of [...this.categories.values()]) {
      if (category.propertyId === propertyId && category.poolId === poolId) {
        this.categories.delete(category.id);
      }
    }
    if (this.pools.get(poolId)?.propertyId === propertyId) {
      this.pools.delete(poolId);
    }
    return Promise.resolve();
  }

  saveCategory(category: Category): Promise<void> {
    this.categories.set(category.id, structuredClone(category));
    return Promise.resolve();
  }

  addPoolMember(
    propertyId: string,
    poolId: string,
    unitId: string,
    changedOn: IsoDate | null,
  ): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error("Simulated store failure"));
    }
    const pool = this.pools.get(poolId);
    if (pool?.propertyId !== propertyId || pool.unitIds.includes(unitId)) {
      return Promise.resolve();
    }
    pool.unitIds = [...pool.unitIds, unitId];
    if (changedOn !== null) pool.membersChangedOn = changedOn;
    return Promise.resolve();
  }

  removeUnitFromPools(
    propertyId: string,
    unitId: string,
    changedOn: IsoDate | null,
  ): Promise<void> {
    for (const pool of this.pools.values()) {
      if (pool.propertyId !== propertyId || !pool.unitIds.includes(unitId)) {
        continue;
      }
      pool.unitIds = pool.unitIds.filter((id) => id !== unitId);
      if (changedOn !== null) pool.membersChangedOn = changedOn;
    }
    return Promise.resolve();
  }

  private propertyTransactions(propertyId: string): Txn[] {
    return [...this.transactions.values()].filter(
      (t) => t.propertyId === propertyId,
    );
  }

  private propertyLines(propertyId: string): AllocationLine[] {
    return this.propertyTransactions(propertyId).flatMap((t) => t.lines);
  }

  hasTransactions(propertyId: string): Promise<boolean> {
    return Promise.resolve(
      this.transactionCount > 0 ||
        this.propertyTransactions(propertyId).length > 0,
    );
  }

  async hasTransactionsOrLedgerEntries(propertyId: string): Promise<boolean> {
    return (
      this.ledgerEntryCount > 0 || (await this.hasTransactions(propertyId))
    );
  }

  categoryHasAllocations(
    propertyId: string,
    categoryId: string,
  ): Promise<boolean> {
    return Promise.resolve(
      this.allocatedCategoryIds.has(categoryId) ||
        this.propertyLines(propertyId).some((l) => l.categoryId === categoryId),
    );
  }

  accountHasActivity(propertyId: string, accountId: string): Promise<boolean> {
    return Promise.resolve(
      this.accountIdsWithActivity.has(accountId) ||
        this.propertyLines(propertyId).some((l) => l.accountId === accountId),
    );
  }

  getBankAccount(propertyId: string): Promise<BankAccount | null> {
    const bankAccount = this.bankAccounts.get(propertyId);
    return Promise.resolve(bankAccount ? structuredClone(bankAccount) : null);
  }

  lockBankAccount(propertyId: string): Promise<BankAccount> {
    const existing = this.bankAccounts.get(propertyId);
    const bankAccount = existing ?? {
      id: randomUUID(),
      propertyId,
      name: "Business checking",
      csvMapping: null,
    };
    this.bankAccounts.set(propertyId, bankAccount);
    return Promise.resolve(structuredClone(bankAccount));
  }

  loadDedupeState(
    propertyId: string,
    bankAccountId: string,
    range: DedupeRange,
  ): Promise<DedupeState> {
    const bankRows = this.propertyTransactions(propertyId).filter(
      (t) =>
        t.source === "bank" &&
        this.importBatches.get(t.importBatchId ?? "")?.bankAccountId ===
          bankAccountId,
    );
    const counts = new Map<string, StoredKeyCount>();
    const externalIds = new Map<string, string>();
    for (const row of bankRows) {
      if (row.postedOn >= range.from && row.postedOn <= range.to) {
        const count = counts.get(dedupeKey(row)) ?? { total: 0, withoutId: 0 };
        count.total += 1;
        if (row.externalId === null) count.withoutId += 1;
        counts.set(dedupeKey(row), count);
      }
      if (
        row.externalId !== null &&
        range.externalIds.includes(row.externalId)
      ) {
        externalIds.set(row.externalId, dedupeKey(row));
      }
    }
    return Promise.resolve({ externalIds, counts });
  }

  saveCsvMapping(
    propertyId: string,
    bankAccountId: string,
    mapping: CsvMapping,
  ): Promise<void> {
    const bankAccount = this.bankAccounts.get(propertyId);
    if (bankAccount?.id === bankAccountId) {
      bankAccount.csvMapping = structuredClone(mapping);
    }
    return Promise.resolve();
  }

  insertImportBatch(
    batch: ImportBatch,
    rows: NewBankTransaction[],
  ): Promise<void> {
    this.importBatches.set(batch.id, structuredClone(batch));
    for (const row of rows) {
      this.transactions.set(row.id, {
        id: row.id,
        propertyId: batch.propertyId,
        source: "bank",
        importBatchId: batch.id,
        postedOn: row.postedOn,
        description: row.description,
        descriptionKey: row.descriptionKey,
        amountCents: row.amountCents,
        externalId: row.externalId,
        lines: [],
      });
    }
    return Promise.resolve();
  }

  private batchSummary(batch: ImportBatch): ImportBatchSummary {
    return {
      ...structuredClone(batch),
      sortedCount: [...this.transactions.values()].filter(
        (t) => t.importBatchId === batch.id && t.lines.length > 0,
      ).length,
    };
  }

  listImportBatches(propertyId: string): Promise<ImportBatchSummary[]> {
    return Promise.resolve(
      [...this.importBatches.values()]
        .filter((b) => b.propertyId === propertyId)
        .sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())
        .map((b) => this.batchSummary(b)),
    );
  }

  lockImportBatch(
    propertyId: string,
    batchId: string,
  ): Promise<ImportBatchSummary | null> {
    const batch = this.importBatches.get(batchId);
    return Promise.resolve(
      batch?.propertyId === propertyId ? this.batchSummary(batch) : null,
    );
  }

  deleteImportBatch(propertyId: string, batchId: string): Promise<void> {
    for (const txn of this.propertyTransactions(propertyId)) {
      if (txn.importBatchId === batchId) this.transactions.delete(txn.id);
    }
    if (this.importBatches.get(batchId)?.propertyId === propertyId) {
      this.importBatches.delete(batchId);
    }
    return Promise.resolve();
  }

  listTransactions(propertyId: string): Promise<Txn[]> {
    return Promise.resolve(
      this.propertyTransactions(propertyId)
        .sort((a, b) =>
          a.postedOn < b.postedOn ? -1 : a.postedOn > b.postedOn ? 1 : 0,
        )
        .map((t) => structuredClone(t)),
    );
  }

  getTransaction(propertyId: string, id: string): Promise<Txn | null> {
    const txn = this.transactions.get(id);
    return Promise.resolve(
      txn?.propertyId === propertyId ? structuredClone(txn) : null,
    );
  }

  replaceAllocations(
    propertyId: string,
    transactionId: string,
    lines: AllocationLine[],
  ): Promise<Txn | null> {
    const txn = this.transactions.get(transactionId);
    if (txn?.propertyId !== propertyId) return Promise.resolve(null);
    if (lines.length > 0) checkAllocationLines(txn.amountCents, lines);
    txn.lines = structuredClone(lines);
    return Promise.resolve(structuredClone(txn));
  }

  private cashTxn(expense: CashExpense): Txn {
    const description = expense.description.trim();
    return {
      id: expense.id,
      propertyId: expense.propertyId,
      source: "cash",
      importBatchId: null,
      postedOn: expense.postedOn,
      description,
      descriptionKey: descriptionKey(description),
      amountCents: -expense.amountCents,
      externalId: null,
      lines: [
        {
          accountId: null,
          categoryId: expense.categoryId,
          amountCents: -expense.amountCents,
        },
      ],
    };
  }

  insertCashExpense(expense: CashExpense): Promise<Txn> {
    const txn = this.cashTxn(expense);
    this.transactions.set(txn.id, txn);
    return Promise.resolve(structuredClone(txn));
  }

  updateCashExpense(expense: CashExpense): Promise<Txn | null> {
    const existing = this.transactions.get(expense.id);
    if (
      existing?.propertyId !== expense.propertyId ||
      existing.source !== "cash"
    ) {
      return Promise.resolve(null);
    }
    const txn = this.cashTxn(expense);
    this.transactions.set(txn.id, txn);
    return Promise.resolve(structuredClone(txn));
  }

  deleteCashExpense(propertyId: string, id: string): Promise<boolean> {
    const existing = this.transactions.get(id);
    if (existing?.propertyId !== propertyId || existing.source !== "cash") {
      return Promise.resolve(false);
    }
    this.transactions.delete(id);
    return Promise.resolve(true);
  }

  snapshot(): () => void {
    const pools = structuredClone(this.pools);
    const categories = structuredClone(this.categories);
    const bankAccounts = structuredClone(this.bankAccounts);
    const importBatches = structuredClone(this.importBatches);
    const transactions = structuredClone(this.transactions);
    return () => {
      this.pools = pools;
      this.categories = categories;
      this.bankAccounts = bankAccounts;
      this.importBatches = importBatches;
      this.transactions = transactions;
    };
  }
}

function toProps(account: Account): AccountProps {
  return {
    id: account.id,
    propertyId: account.propertyId,
    tenantId: account.tenantId,
    unitId: account.unitId,
    openingBalanceCents: account.openingBalanceCents,
    leases: account.leases,
  };
}

export class InMemoryAccountStore
  implements AccountRepository, AccountQueries, Restorable
{
  accounts = new Map<string, AccountProps>();

  findById(propertyId: string, id: string): Promise<Account | null> {
    const props = this.accounts.get(id);
    if (props?.propertyId !== propertyId) return Promise.resolve(null);
    return Promise.resolve(Account.reconstitute(structuredClone(props)));
  }

  save(account: Account): Promise<void> {
    account.pullEvents();
    this.accounts.set(account.id, structuredClone(toProps(account)));
    return Promise.resolve();
  }

  delete(propertyId: string, id: string): Promise<void> {
    if (this.accounts.get(id)?.propertyId === propertyId) {
      this.accounts.delete(id);
    }
    return Promise.resolve();
  }

  list(propertyId: string): Promise<AccountView[]> {
    return Promise.resolve(
      [...this.accounts.values()]
        .filter((a) => a.propertyId === propertyId)
        .map((a) => structuredClone(a)),
    );
  }

  getById(propertyId: string, id: string): Promise<AccountView | null> {
    const props = this.accounts.get(id);
    if (props?.propertyId !== propertyId) return Promise.resolve(null);
    return Promise.resolve(structuredClone(props));
  }

  snapshot(): () => void {
    const accounts = structuredClone(this.accounts);
    return () => {
      this.accounts = accounts;
    };
  }
}

export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    private stores: TransactionalStores,
    private restorables: Restorable[],
  ) {}

  async run<T>(fn: (stores: TransactionalStores) => Promise<T>): Promise<T> {
    const restores = this.restorables.map((r) => r.snapshot());
    try {
      return await fn(this.stores);
    } catch (error) {
      for (const restore of restores) restore();
      throw error;
    }
  }
}
