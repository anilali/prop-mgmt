import type { BillingQueries, BillingStore } from "@moonship/billing";
import type { AccountQueries, AccountRepository } from "@moonship/lease-mgmt";
import type {
  PropertyQueries,
  PropertyRepository,
  UnitQueries,
  UnitRepository,
} from "@moonship/property";
import type { TenantQueries } from "@moonship/tenant-mgmt";

export interface TransactionalStores {
  billing: BillingStore;
  accountRepository: AccountRepository;
  unitRepository: UnitRepository;
  propertyRepository: PropertyRepository;
  billingQueries: BillingQueries;
  accountQueries: AccountQueries;
  tenantQueries: TenantQueries;
  unitQueries: UnitQueries;
  propertyQueries: PropertyQueries;
}

export interface UnitOfWorkOptions {
  isolationLevel?: "read committed" | "repeatable read";
}

export interface UnitOfWork {
  run<T>(
    fn: (stores: TransactionalStores) => Promise<T>,
    options?: UnitOfWorkOptions,
  ): Promise<T>;
}
