import type {
  BillingQueries,
  BillingStore,
  Category,
  Pool,
} from "@moonship/billing";
import type {
  AccountProps,
  AccountQueries,
  AccountRepository,
  AccountView,
} from "@moonship/lease-mgmt";
import type { IsoDate } from "@moonship/shared";
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

  hasTransactions(_propertyId: string): Promise<boolean> {
    return Promise.resolve(this.transactionCount > 0);
  }

  hasTransactionsOrLedgerEntries(_propertyId: string): Promise<boolean> {
    return Promise.resolve(this.transactionCount + this.ledgerEntryCount > 0);
  }

  categoryHasAllocations(
    _propertyId: string,
    categoryId: string,
  ): Promise<boolean> {
    return Promise.resolve(this.allocatedCategoryIds.has(categoryId));
  }

  accountHasActivity(_propertyId: string, accountId: string): Promise<boolean> {
    return Promise.resolve(this.accountIdsWithActivity.has(accountId));
  }

  snapshot(): () => void {
    const pools = structuredClone(this.pools);
    const categories = structuredClone(this.categories);
    return () => {
      this.pools = pools;
      this.categories = categories;
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
