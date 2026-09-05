import type {
  PropertyQueries,
  PropertyRepository,
  StaffMemberQueries,
  StaffMemberRepository,
  UnitQueries,
  UnitRepository,
} from "@moonship/property";
import type { TenantQueries, TenantRepository } from "@moonship/tenant-mgmt";
import type { LeaseQueries, LeaseRepository } from "@moonship/lease-mgmt";
import type { BlobStorage } from "@moonship/blob-storage";

import type { OperatorSession } from "./trpc";
import { authRouter } from "./routers/auth";
import { leaseRouter } from "./routers/lease";
import { propertyRouter } from "./routers/property";
import { staffRouter } from "./routers/staff";
import { tenantRouter } from "./routers/tenant";
import { unitRouter } from "./routers/unit";
import { createCallerFactory, router } from "./trpc";

export interface OperatorRouterDeps {
  propertyRepository: PropertyRepository;
  propertyQueries: PropertyQueries;
  unitRepository: UnitRepository;
  unitQueries: UnitQueries;
  staffMemberRepository: StaffMemberRepository;
  staffMemberQueries: StaffMemberQueries;
  tenantRepository: TenantRepository;
  tenantQueries: TenantQueries;
  leaseRepository: LeaseRepository;
  leaseQueries: LeaseQueries;
  blobStorage: BlobStorage;
}

export function createTRPCRouter(deps: OperatorRouterDeps) {
  const appRouter = router({
    auth: authRouter(),
    property: propertyRouter({
      propertyRepository: deps.propertyRepository,
      propertyQueries: deps.propertyQueries,
      staffMemberQueries: deps.staffMemberQueries,
      staffMemberRepository: deps.staffMemberRepository,
    }),
    unit: unitRouter({
      unitRepository: deps.unitRepository,
      unitQueries: deps.unitQueries,
      propertyRepository: deps.propertyRepository,
      leaseQueries: deps.leaseQueries,
    }),
    staff: staffRouter({
      staffMemberRepository: deps.staffMemberRepository,
      staffMemberQueries: deps.staffMemberQueries,
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
    session: OperatorSession | null;
  }) => {
    return {
      session: opts.session,
    };
  };

  return {
    appRouter,
    createTRPCContext,
    createCallerFactory,
  };
}

export type AppRouter = ReturnType<typeof createTRPCRouter>["appRouter"];
