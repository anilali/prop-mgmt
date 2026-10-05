import type { AccessQueries, PropertyAccessRepository } from "@moonship/access";
import type { BillingQueries, BillingStore } from "@moonship/billing";
import type { BlobStorage } from "@moonship/blob-storage";
import type { AccountQueries, AccountRepository } from "@moonship/lease-mgmt";
import type {
  PropertyQueries,
  PropertyRepository,
  UnitQueries,
  UnitRepository,
} from "@moonship/property";
import type { TenantQueries, TenantRepository } from "@moonship/tenant-mgmt";

import type { RequestAccess } from "./operator-context";
import type { UnitOfWork } from "./unit-of-work";
import { accessRouter } from "./routers/access";
import { accountRouter } from "./routers/account";
import { bankImportRouter } from "./routers/bank-import";
import { categoryRouter } from "./routers/category";
import { leaseRouter } from "./routers/lease";
import { poolRouter } from "./routers/pool";
import { propertyRouter } from "./routers/property";
import { tenantRouter } from "./routers/tenant";
import { transactionRouter } from "./routers/transaction";
import { unitRouter } from "./routers/unit";
import { createCallerFactory, router } from "./trpc";

export interface OperatorRouterDeps {
  propertyRepository: PropertyRepository;
  propertyQueries: PropertyQueries;
  unitRepository: UnitRepository;
  unitQueries: UnitQueries;
  propertyAccessRepository: PropertyAccessRepository;
  accessQueries: AccessQueries;
  tenantRepository: TenantRepository;
  tenantQueries: TenantQueries;
  accountRepository: AccountRepository;
  accountQueries: AccountQueries;
  billingStore: BillingStore;
  billingQueries: BillingQueries;
  unitOfWork: UnitOfWork;
  blobStorage: BlobStorage;
}

export function createTRPCRouter(deps: OperatorRouterDeps) {
  const accountDeps = {
    accountRepository: deps.accountRepository,
    accountQueries: deps.accountQueries,
    tenantQueries: deps.tenantQueries,
    unitQueries: deps.unitQueries,
    propertyQueries: deps.propertyQueries,
    billingQueries: deps.billingQueries,
  };

  const appRouter = router({
    property: propertyRouter({
      propertyRepository: deps.propertyRepository,
      propertyQueries: deps.propertyQueries,
      accountQueries: deps.accountQueries,
      billingQueries: deps.billingQueries,
      unitOfWork: deps.unitOfWork,
    }),
    unit: unitRouter({
      unitRepository: deps.unitRepository,
      unitQueries: deps.unitQueries,
      propertyQueries: deps.propertyQueries,
      accountQueries: deps.accountQueries,
      billingQueries: deps.billingQueries,
      unitOfWork: deps.unitOfWork,
    }),
    pool: poolRouter({
      billingStore: deps.billingStore,
      billingQueries: deps.billingQueries,
      unitQueries: deps.unitQueries,
      accountQueries: deps.accountQueries,
      propertyQueries: deps.propertyQueries,
      unitOfWork: deps.unitOfWork,
    }),
    category: categoryRouter({
      billingStore: deps.billingStore,
      billingQueries: deps.billingQueries,
    }),
    access: accessRouter({
      propertyAccessRepository: deps.propertyAccessRepository,
      accessQueries: deps.accessQueries,
    }),
    tenant: tenantRouter({
      tenantRepository: deps.tenantRepository,
      tenantQueries: deps.tenantQueries,
    }),
    account: accountRouter(accountDeps),
    lease: leaseRouter(accountDeps),
    bankImport: bankImportRouter({
      billingQueries: deps.billingQueries,
      propertyQueries: deps.propertyQueries,
      unitOfWork: deps.unitOfWork,
    }),
    transaction: transactionRouter({
      billingQueries: deps.billingQueries,
      accountQueries: deps.accountQueries,
      propertyQueries: deps.propertyQueries,
      unitOfWork: deps.unitOfWork,
    }),
  });

  const createTRPCContext = (opts: {
    headers: Headers;
    access: RequestAccess | null;
  }) => {
    return {
      access: opts.access,
    };
  };

  return {
    appRouter,
    createTRPCContext,
    createCallerFactory,
  };
}

export type AppRouter = ReturnType<typeof createTRPCRouter>["appRouter"];
