import type { IsoDate } from "@moonship/shared";

import type { Category, Pool } from "./types";

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
}
