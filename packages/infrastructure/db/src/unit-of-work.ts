import { ConcurrentUpdateError } from "@moonship/shared";

import type { DatabaseClient, DbExecutor } from "./client";
import { isConcurrentUpdate } from "./pg-errors";
import { PGBillingQueries } from "./queries/billing/billing-queries";
import { PGAccountQueries } from "./queries/lease-mgmt/account-queries";
import { PGPropertyQueries } from "./queries/property/property-queries";
import { PGUnitQueries } from "./queries/property/unit-queries";
import { PGTenantQueries } from "./queries/tenant-mgmt/tenant-queries";
import { PGBillingStore } from "./repositories/billing/billing-store";
import { PGAccountRepository } from "./repositories/lease-mgmt/account-repository";
import { PGPropertyRepository } from "./repositories/property/property-repository";
import { PGUnitRepository } from "./repositories/property/unit-repository";

export interface PGTransactionalStores {
  billing: PGBillingStore;
  accountRepository: PGAccountRepository;
  unitRepository: PGUnitRepository;
  propertyRepository: PGPropertyRepository;
  billingQueries: PGBillingQueries;
  accountQueries: PGAccountQueries;
  tenantQueries: PGTenantQueries;
  unitQueries: PGUnitQueries;
  propertyQueries: PGPropertyQueries;
}

export interface PGUnitOfWorkOptions {
  isolationLevel?: "read committed" | "repeatable read";
}

export interface PGUnitOfWork {
  run<T>(
    fn: (stores: PGTransactionalStores) => Promise<T>,
    options?: PGUnitOfWorkOptions,
  ): Promise<T>;
}

function storesFor(db: DbExecutor): PGTransactionalStores {
  return {
    billing: new PGBillingStore(db),
    accountRepository: new PGAccountRepository(db),
    unitRepository: new PGUnitRepository(db),
    propertyRepository: new PGPropertyRepository(db),
    billingQueries: new PGBillingQueries(db),
    accountQueries: new PGAccountQueries(db),
    tenantQueries: new PGTenantQueries(db),
    unitQueries: new PGUnitQueries(db),
    propertyQueries: new PGPropertyQueries(db),
  };
}

export function createPGUnitOfWork(db: DatabaseClient): PGUnitOfWork {
  return {
    async run<T>(
      fn: (stores: PGTransactionalStores) => Promise<T>,
      options?: PGUnitOfWorkOptions,
    ): Promise<T> {
      try {
        return await db.transaction(
          (tx) => fn(storesFor(tx)),
          options?.isolationLevel
            ? { isolationLevel: options.isolationLevel }
            : undefined,
        );
      } catch (error) {
        if (isConcurrentUpdate(error)) {
          throw new ConcurrentUpdateError();
        }
        throw error;
      }
    },
  };
}
