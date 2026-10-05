import type { DatabaseClient, DbExecutor } from "./client";
import { PGBillingStore } from "./repositories/billing/billing-store";
import { PGAccountRepository } from "./repositories/lease-mgmt/account-repository";
import { PGPropertyRepository } from "./repositories/property/property-repository";
import { PGUnitRepository } from "./repositories/property/unit-repository";

export interface PGTransactionalStores {
  billing: PGBillingStore;
  accountRepository: PGAccountRepository;
  unitRepository: PGUnitRepository;
  propertyRepository: PGPropertyRepository;
}

export interface PGUnitOfWork {
  run<T>(fn: (stores: PGTransactionalStores) => Promise<T>): Promise<T>;
}

function storesFor(db: DbExecutor): PGTransactionalStores {
  return {
    billing: new PGBillingStore(db),
    accountRepository: new PGAccountRepository(db),
    unitRepository: new PGUnitRepository(db),
    propertyRepository: new PGPropertyRepository(db),
  };
}

export function createPGUnitOfWork(db: DatabaseClient): PGUnitOfWork {
  return {
    run<T>(fn: (stores: PGTransactionalStores) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(storesFor(tx)));
    },
  };
}
