import type { AccessQueries, PropertyAccessRepository } from "@moonship/access";
import type { BlobStorage } from "@moonship/blob-storage";
import type { LeaseQueries, LeaseRepository } from "@moonship/lease-mgmt";
import type {
  PropertyQueries,
  PropertyRepository,
  UnitQueries,
  UnitRepository,
} from "@moonship/property";
import type { TenantQueries, TenantRepository } from "@moonship/tenant-mgmt";

import type { RequestAccess } from "./operator-context";
import { accessRouter } from "./routers/access";
import { leaseRouter } from "./routers/lease";
import { propertyRouter } from "./routers/property";
import { tenantRouter } from "./routers/tenant";
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
  leaseRepository: LeaseRepository;
  leaseQueries: LeaseQueries;
  blobStorage: BlobStorage;
}

export function createTRPCRouter(deps: OperatorRouterDeps) {
  const appRouter = router({
    property: propertyRouter({
      propertyRepository: deps.propertyRepository,
      propertyQueries: deps.propertyQueries,
    }),
    unit: unitRouter({
      unitRepository: deps.unitRepository,
      unitQueries: deps.unitQueries,
      leaseQueries: deps.leaseQueries,
    }),
    access: accessRouter({
      propertyAccessRepository: deps.propertyAccessRepository,
      accessQueries: deps.accessQueries,
    }),
    tenant: tenantRouter({
      tenantRepository: deps.tenantRepository,
      tenantQueries: deps.tenantQueries,
    }),
    lease: leaseRouter({
      leaseRepository: deps.leaseRepository,
      leaseQueries: deps.leaseQueries,
      unitQueries: deps.unitQueries,
      tenantQueries: deps.tenantQueries,
      blobStorage: deps.blobStorage,
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
