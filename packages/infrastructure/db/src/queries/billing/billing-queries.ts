import type { BillingQueries, Category, Pool } from "@moonship/billing";

import type { DbExecutor } from "../../client";
import {
  loadCategories,
  loadPools,
} from "../../repositories/billing/billing-rows";

export class PGBillingQueries implements BillingQueries {
  constructor(private db: DbExecutor) {}

  listPools(propertyId: string): Promise<Pool[]> {
    return loadPools(this.db, propertyId);
  }

  listCategories(propertyId: string): Promise<Category[]> {
    return loadCategories(this.db, propertyId);
  }

  hasTransactions(_propertyId: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  hasTransactionsOrLedgerEntries(_propertyId: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  categoryHasAllocations(
    _propertyId: string,
    _categoryId: string,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }

  accountHasActivity(
    _propertyId: string,
    _accountId: string,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }
}
