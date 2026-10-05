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
  LedgerEntry,
  NewBankTransaction,
  Pool,
  PoolBillOverride,
  ReconciliationYear,
  StatementData,
  StatementRenderer,
  StatementSnapshot,
  StoredKeyCount,
  Txn,
} from "@moonship/billing";
import type {
  BlobStorage,
  PutObjectInput,
  SignedDownloadOptions,
} from "@moonship/blob-storage";
import type {
  AccountProps,
  AccountQueries,
  AccountRepository,
  AccountView,
} from "@moonship/lease-mgmt";
import type { IsoDate } from "@moonship/shared";
import {
  checkAllocationLines,
  checkLedgerEntry,
  dedupeKey,
  descriptionKey,
  DuplicateLedgerEntryError,
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
  ledgerEntries = new Map<string, LedgerEntry>();
  finalizedYears: number[] = [];
  reconciliationYears = new Map<string, ReconciliationYear>();
  billOverrides = new Map<string, PoolBillOverride>();
  statementSnapshots = new Map<string, StatementSnapshot>();

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

  private propertyEntries(propertyId: string): LedgerEntry[] {
    return [...this.ledgerEntries.values()].filter(
      (e) => e.propertyId === propertyId,
    );
  }

  async hasTransactionsOrLedgerEntries(propertyId: string): Promise<boolean> {
    return (
      this.ledgerEntryCount > 0 ||
      this.propertyEntries(propertyId).length > 0 ||
      (await this.hasTransactions(propertyId))
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
        this.propertyLines(propertyId).some((l) => l.accountId === accountId) ||
        this.propertyEntries(propertyId).some(
          (e) => e.accountId === accountId,
        ) ||
        [...this.statementSnapshots.values()].some(
          (s) => s.propertyId === propertyId && s.accountId === accountId,
        ),
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

  listLedgerEntries(propertyId: string): Promise<LedgerEntry[]> {
    return Promise.resolve(
      this.propertyEntries(propertyId)
        .sort((a, b) =>
          a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0,
        )
        .map((e) => structuredClone(e)),
    );
  }

  getLedgerEntry(propertyId: string, id: string): Promise<LedgerEntry | null> {
    const entry = this.ledgerEntries.get(id);
    return Promise.resolve(
      entry?.propertyId === propertyId ? structuredClone(entry) : null,
    );
  }

  listFinalizedYears(propertyId: string): Promise<number[]> {
    const stored = [...this.reconciliationYears.values()]
      .filter((y) => y.propertyId === propertyId && y.status === "finalized")
      .map((y) => y.year);
    return Promise.resolve([...new Set([...this.finalizedYears, ...stored])]);
  }

  listReconciliationYears(propertyId: string): Promise<ReconciliationYear[]> {
    return Promise.resolve(
      [...this.reconciliationYears.values()]
        .filter((y) => y.propertyId === propertyId)
        .sort((a, b) => a.year - b.year)
        .map((y) => structuredClone(y)),
    );
  }

  listBillOverrides(propertyId: string): Promise<PoolBillOverride[]> {
    return Promise.resolve(
      [...this.billOverrides.values()]
        .filter((o) => o.propertyId === propertyId)
        .sort((a, b) => a.year - b.year)
        .map((o) => structuredClone(o)),
    );
  }

  lockYear(propertyId: string, year: number): Promise<ReconciliationYear> {
    const existing = [...this.reconciliationYears.values()].find(
      (y) => y.propertyId === propertyId && y.year === year,
    );
    const record = existing ?? {
      id: randomUUID(),
      propertyId,
      year,
      status: "draft" as const,
      letterDate: null,
      finalizedAt: null,
    };
    this.reconciliationYears.set(record.id, record);
    return Promise.resolve(structuredClone(record));
  }

  saveYear(year: ReconciliationYear): Promise<ReconciliationYear> {
    const existing = this.reconciliationYears.get(year.id);
    if (existing?.propertyId !== year.propertyId) {
      return Promise.reject(
        new Error(`Reconciliation year ${year.year} not found`),
      );
    }
    if (
      year.status === "finalized" &&
      (year.finalizedAt === null || year.letterDate === null)
    ) {
      return Promise.reject(new Error("A finalized year needs a letter date"));
    }
    const saved = { ...existing, ...structuredClone(year) };
    this.reconciliationYears.set(saved.id, saved);
    return Promise.resolve(structuredClone(saved));
  }

  saveBillOverride(override: PoolBillOverride): Promise<PoolBillOverride> {
    if (override.amountCents < 0 || override.note.trim() === "") {
      return Promise.reject(new Error("Invalid bill amount"));
    }
    const existing = [...this.billOverrides.values()].find(
      (o) =>
        o.reconciliationYearId === override.reconciliationYearId &&
        o.poolId === override.poolId,
    );
    const saved = {
      ...structuredClone(override),
      id: existing?.id ?? override.id,
      note: override.note.trim(),
    };
    this.billOverrides.set(saved.id, saved);
    return Promise.resolve(structuredClone(saved));
  }

  deleteBillOverride(
    propertyId: string,
    reconciliationYearId: string,
    poolId: string,
  ): Promise<boolean> {
    const existing = [...this.billOverrides.values()].find(
      (o) =>
        o.propertyId === propertyId &&
        o.reconciliationYearId === reconciliationYearId &&
        o.poolId === poolId,
    );
    if (!existing) return Promise.resolve(false);
    this.billOverrides.delete(existing.id);
    return Promise.resolve(true);
  }

  listStatementSnapshots(propertyId: string): Promise<StatementSnapshot[]> {
    return Promise.resolve(
      [...this.statementSnapshots.values()]
        .filter((s) => s.propertyId === propertyId)
        .sort((a, b) => a.year - b.year)
        .map((s) => structuredClone(s)),
    );
  }

  insertStatementSnapshot(
    snapshot: StatementSnapshot,
  ): Promise<StatementSnapshot> {
    if (
      [...this.statementSnapshots.values()].some(
        (s) =>
          s.reconciliationYearId === snapshot.reconciliationYearId &&
          s.accountId === snapshot.accountId,
      )
    ) {
      return Promise.reject(new Error("Duplicate statement snapshot"));
    }
    this.statementSnapshots.set(snapshot.id, structuredClone(snapshot));
    return Promise.resolve(structuredClone(snapshot));
  }

  insertLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry> {
    checkLedgerEntry(entry);
    if (
      [...this.ledgerEntries.values()].some(
        (e) =>
          e.accountId === entry.accountId &&
          ((entry.feeMonth !== null && e.feeMonth === entry.feeMonth) ||
            (entry.kind === "true_up" &&
              e.kind === "true_up" &&
              e.reconciliationYearId === entry.reconciliationYearId)),
      )
    ) {
      return Promise.reject(new DuplicateLedgerEntryError());
    }
    this.ledgerEntries.set(entry.id, structuredClone(entry));
    return Promise.resolve(structuredClone(entry));
  }

  updateLedgerEntry(entry: LedgerEntry): Promise<LedgerEntry | null> {
    checkLedgerEntry(entry);
    const existing = this.ledgerEntries.get(entry.id);
    if (
      existing?.propertyId !== entry.propertyId ||
      existing.accountId !== entry.accountId ||
      existing.kind !== entry.kind
    ) {
      return Promise.resolve(null);
    }
    const updated = {
      ...existing,
      entryDate: entry.entryDate,
      amountCents: entry.amountCents,
      note: entry.note,
    };
    this.ledgerEntries.set(entry.id, updated);
    return Promise.resolve(structuredClone(updated));
  }

  deleteLedgerEntry(propertyId: string, id: string): Promise<boolean> {
    if (this.ledgerEntries.get(id)?.propertyId !== propertyId) {
      return Promise.resolve(false);
    }
    this.ledgerEntries.delete(id);
    return Promise.resolve(true);
  }

  snapshot(): () => void {
    const pools = structuredClone(this.pools);
    const categories = structuredClone(this.categories);
    const bankAccounts = structuredClone(this.bankAccounts);
    const importBatches = structuredClone(this.importBatches);
    const transactions = structuredClone(this.transactions);
    const ledgerEntries = structuredClone(this.ledgerEntries);
    const reconciliationYears = structuredClone(this.reconciliationYears);
    const billOverrides = structuredClone(this.billOverrides);
    const statementSnapshots = structuredClone(this.statementSnapshots);
    return () => {
      this.reconciliationYears = reconciliationYears;
      this.billOverrides = billOverrides;
      this.statementSnapshots = statementSnapshots;
      this.pools = pools;
      this.categories = categories;
      this.bankAccounts = bankAccounts;
      this.importBatches = importBatches;
      this.transactions = transactions;
      this.ledgerEntries = ledgerEntries;
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

export class FakeStatementRenderer implements StatementRenderer {
  rendered: StatementData[] = [];
  failOnCall: number | null = null;
  private calls = 0;

  render(data: StatementData): Promise<Uint8Array> {
    this.calls += 1;
    if (this.calls === this.failOnCall) {
      return Promise.reject(new Error("Simulated render failure"));
    }
    this.rendered.push(structuredClone(data));
    return Promise.resolve(
      new TextEncoder().encode(`%PDF-fake ${data.tenant.businessName}`),
    );
  }
}

export class FakeBlobStorage implements BlobStorage {
  objects = new Map<string, { body: Uint8Array; contentType: string }>();
  puts: string[] = [];
  signed: { key: string; options: SignedDownloadOptions | undefined }[] = [];

  putObject(input: PutObjectInput): Promise<{ key: string }> {
    this.puts.push(input.key);
    this.objects.set(input.key, {
      body: Uint8Array.from(input.body),
      contentType: input.contentType,
    });
    return Promise.resolve({ key: input.key });
  }

  getSignedDownloadUrl(
    key: string,
    options?: SignedDownloadOptions,
  ): Promise<string> {
    this.signed.push({ key, options });
    return Promise.resolve(`https://blob/${key}`);
  }

  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
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
