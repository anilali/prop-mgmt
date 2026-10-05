import type { BillingStore } from "@moonship/billing";
import type { AccountRepository } from "@moonship/lease-mgmt";
import type { PropertyRepository, UnitRepository } from "@moonship/property";

export interface TransactionalStores {
  billing: BillingStore;
  accountRepository: AccountRepository;
  unitRepository: UnitRepository;
  propertyRepository: PropertyRepository;
}

export interface UnitOfWork {
  run<T>(fn: (stores: TransactionalStores) => Promise<T>): Promise<T>;
}
