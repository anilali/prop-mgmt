import { randomUUID } from "node:crypto";
import type { TRPCRouterCaller } from "@trpc/server";

import type {
  PropertyProps,
  PropertyQueries,
  PropertyRepository,
  PropertyView,
  UnitProps,
  UnitQueries,
  UnitRepository,
  UnitView,
} from "@moonship/property";
import type {
  TenantProps,
  TenantQueries,
  TenantRepository,
  TenantView,
} from "@moonship/tenant-mgmt";
import { PlatformAdmin } from "@moonship/access";
import { seedPropertySetup } from "@moonship/billing";
import { Property, Unit } from "@moonship/property";
import { Tenant } from "@moonship/tenant-mgmt";

import type { Operator } from "./operator";
import type { AppRouter } from "./root";
import type { Restorable } from "./test-billing-store";
import { loadRequestAccess } from "./operator-context";
import { createTRPCRouter } from "./root";
import { InMemoryAccessStore, seedAccess } from "./test-access-store";
import {
  InMemoryAccountStore,
  InMemoryBillingStore,
  InMemoryUnitOfWork,
} from "./test-billing-store";
import { createCallerFactory } from "./trpc";

export class InMemoryPropertyStore
  implements PropertyRepository, PropertyQueries, Restorable
{
  properties = new Map<string, PropertyProps>();

  findById(id: string): Promise<Property | null> {
    const props = this.properties.get(id);
    return Promise.resolve(
      props ? Property.reconstitute(structuredClone(props)) : null,
    );
  }

  save(property: Property): Promise<void> {
    property.pullEvents();
    this.properties.set(property.id, {
      id: property.id,
      name: property.name,
      address: structuredClone(property.address),
      trackingStartDate: property.trackingStartDate,
      timeZone: property.timeZone,
      letter: property.letter,
    });
    return Promise.resolve();
  }

  getById(id: string): Promise<PropertyView | null> {
    const props = this.properties.get(id);
    return Promise.resolve(props ? structuredClone(props) : null);
  }

  listByIds(ids: string[]): Promise<PropertyView[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const props = this.properties.get(id);
        return props ? [structuredClone(props)] : [];
      }),
    );
  }

  list(): Promise<PropertyView[]> {
    return Promise.resolve(
      [...this.properties.values()].map((p) => structuredClone(p)),
    );
  }

  snapshot(): () => void {
    const properties = structuredClone(this.properties);
    return () => {
      this.properties = properties;
    };
  }
}

export class InMemoryUnitStore
  implements UnitRepository, UnitQueries, Restorable
{
  units = new Map<string, UnitProps>();

  findById(propertyId: string, id: string): Promise<Unit | null> {
    const props = this.units.get(id);
    if (props?.propertyId !== propertyId) return Promise.resolve(null);
    return Promise.resolve(Unit.reconstitute(structuredClone(props)));
  }

  save(unit: Unit): Promise<void> {
    unit.pullEvents();
    this.units.set(unit.id, {
      id: unit.id,
      propertyId: unit.propertyId,
      label: unit.label,
      sqft: unit.sqft,
      sqftChangedOn: unit.sqftChangedOn,
      address: structuredClone(unit.address),
    });
    return Promise.resolve();
  }

  delete(propertyId: string, id: string): Promise<void> {
    if (this.units.get(id)?.propertyId === propertyId) this.units.delete(id);
    return Promise.resolve();
  }

  list(propertyId: string): Promise<UnitView[]> {
    return Promise.resolve(
      [...this.units.values()]
        .filter((u) => u.propertyId === propertyId)
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((u) => structuredClone(u)),
    );
  }

  getById(propertyId: string, id: string): Promise<UnitView | null> {
    const props = this.units.get(id);
    if (props?.propertyId !== propertyId) return Promise.resolve(null);
    return Promise.resolve(structuredClone(props));
  }

  snapshot(): () => void {
    const units = structuredClone(this.units);
    return () => {
      this.units = units;
    };
  }
}

export class InMemoryTenantStore implements TenantRepository, TenantQueries {
  tenants = new Map<string, TenantProps>();

  findById(propertyId: string, id: string): Promise<Tenant | null> {
    const props = this.tenants.get(id);
    if (props?.propertyId !== propertyId) return Promise.resolve(null);
    return Promise.resolve(Tenant.reconstitute(structuredClone(props)));
  }

  save(tenant: Tenant): Promise<void> {
    tenant.pullEvents();
    this.tenants.set(tenant.id, {
      id: tenant.id,
      propertyId: tenant.propertyId,
      businessName: tenant.businessName,
      contactName: tenant.contactName,
      mailingAddress: tenant.mailingAddress,
      email: tenant.email,
      phone: tenant.phone,
      notes: tenant.notes,
      status: tenant.status,
    });
    return Promise.resolve();
  }

  list(propertyId: string): Promise<TenantView[]> {
    return Promise.resolve(
      [...this.tenants.values()]
        .filter((t) => t.propertyId === propertyId)
        .map((t) => structuredClone(t)),
    );
  }

  getById(propertyId: string, id: string): Promise<TenantView | null> {
    const props = this.tenants.get(id);
    if (props?.propertyId !== propertyId) return Promise.resolve(null);
    return Promise.resolve(structuredClone(props));
  }
}

export type TestCaller = ReturnType<
  TRPCRouterCaller<
    AppRouter["_def"]["_config"]["$types"],
    AppRouter["_def"]["record"]
  >
>;

export const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_MEMBERSHIP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const PROPERTY_ADMIN: Operator = {
  authUserId: "auth-admin",
  email: "admin@example.com",
  name: "Admin",
};

export const PLATFORM_ADMIN: Operator = {
  authUserId: "auth-root",
  email: "root@example.com",
  name: "Root",
};

export const STRANGER: Operator = {
  authUserId: "auth-x",
  email: "x@example.com",
  name: "X",
};

export const TEST_ADDRESS = {
  street1: "100 Main St",
  city: "Springfield",
  state: "IL",
  postalCode: "62701",
  country: "US",
};

export function createTestApp(
  options: { trackingStartDate?: string | null } = {},
) {
  const access = new InMemoryAccessStore();
  access.seed(
    seedAccess(PROPERTY_ID, [
      {
        id: ADMIN_MEMBERSHIP_ID,
        email: PROPERTY_ADMIN.email,
        role: "admin",
        authUserId: PROPERTY_ADMIN.authUserId,
      },
    ]),
  );
  access.seedAdmin(
    PlatformAdmin.reconstitute({
      id: "pa-root",
      email: PLATFORM_ADMIN.email,
      authUserId: PLATFORM_ADMIN.authUserId,
    }),
  );

  const properties = new InMemoryPropertyStore();
  properties.properties.set(PROPERTY_ID, {
    id: PROPERTY_ID,
    name: "Main Street Center",
    address: TEST_ADDRESS,
    trackingStartDate:
      options.trackingStartDate === undefined
        ? "2026-01-01"
        : options.trackingStartDate,
    timeZone: "America/Chicago",
    letter: {
      ownerName: null,
      ownerTitle: null,
      companyName: null,
      ownerPhone: null,
      ownerEmail: null,
    },
  });
  const units = new InMemoryUnitStore();
  const tenants = new InMemoryTenantStore();
  const accounts = new InMemoryAccountStore();
  const billing = new InMemoryBillingStore();
  const seeds = seedPropertySetup({
    propertyId: PROPERTY_ID,
    unitIds: [],
    newId: randomUUID,
  });
  for (const pool of seeds.pools) billing.pools.set(pool.id, pool);
  for (const category of seeds.categories) {
    billing.categories.set(category.id, category);
  }
  const unitOfWork = new InMemoryUnitOfWork(
    {
      billing,
      accountRepository: accounts,
      unitRepository: units,
      propertyRepository: properties,
    },
    [billing, accounts, units, properties],
  );

  const { appRouter } = createTRPCRouter({
    propertyRepository: properties,
    propertyQueries: properties,
    unitRepository: units,
    unitQueries: units,
    propertyAccessRepository: access.repository,
    accessQueries: access.queries,
    tenantRepository: tenants,
    tenantQueries: tenants,
    accountRepository: accounts,
    accountQueries: accounts,
    billingStore: billing,
    billingQueries: billing,
    unitOfWork,
    blobStorage: {
      putObject: (input) => Promise.resolve({ key: input.key }),
      getSignedDownloadUrl: (key) => Promise.resolve(`https://blob/${key}`),
      deleteObject: () => Promise.resolve(),
    },
  });

  async function callerFor(
    operator: Operator = PROPERTY_ADMIN,
    cookieValue: string | null = PROPERTY_ID,
  ): Promise<TestCaller> {
    const requestAccess = await loadRequestAccess(
      {
        accessQueries: access.queries,
        platformAdminRepository: access.adminRepository,
        propertyQueries: properties,
      },
      { operator, cookieValue },
    );
    return createCallerFactory(appRouter)({ access: requestAccess });
  }

  return { access, properties, units, tenants, accounts, billing, callerFor };
}

export async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return String(error.code);
    }
    throw error;
  }
  throw new Error("expected procedure to throw");
}

export function leaseInput(
  overrides: Partial<{
    startDate: string;
    endDate: string;
    moveOutDate: string | null;
    rentCents: number;
    estimates: { poolId: string; startsOn: string; amountCents: number }[];
  }> = {},
) {
  const startDate = overrides.startDate ?? "2026-01-01";
  return {
    startDate,
    endDate: overrides.endDate ?? "2026-12-31",
    moveOutDate: overrides.moveOutDate ?? null,
    rentSteps: [
      { startsOn: startDate, amountCents: overrides.rentCents ?? 250_000 },
    ],
    estimates: (overrides.estimates ?? []).map((estimate) => ({
      poolId: estimate.poolId,
      steps: [
        { startsOn: estimate.startsOn, amountCents: estimate.amountCents },
      ],
    })),
    lateFee: { amountCents: 5000, day: 10 },
    insuranceExpiresOn: null,
  };
}
