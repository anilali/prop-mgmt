import type {
  AccessQueries,
  MembershipView,
  PlatformAdminRepository,
  PropertyAccessRepository,
} from "@moonship/access";
import type { PropertyQueries, PropertyView } from "@moonship/property";
import { PlatformAdmin, PropertyAccess } from "@moonship/access";

export class InMemoryAccessStore {
  aggregates = new Map<string, PropertyAccess>();
  admins = new Map<string, PlatformAdmin>();

  repository: PropertyAccessRepository = {
    findByPropertyId: (propertyId: string) => {
      const access = this.aggregates.get(propertyId);
      if (!access) return Promise.resolve(null);
      return Promise.resolve(
        PropertyAccess.reconstitute({
          propertyId: access.propertyId,
          memberships: access.memberships,
          version: access.version,
        }),
      );
    },
    save: async (access: PropertyAccess, expectedVersion: number) => {
      const stored = this.aggregates.get(access.propertyId);
      const storedVersion = stored ? stored.version : 0;
      if (stored && storedVersion !== expectedVersion) {
        const { OptimisticConcurrencyError } = await import("@moonship/access");
        throw new OptimisticConcurrencyError(
          `Concurrent update on property access ${access.propertyId}`,
        );
      }
      if (!stored && expectedVersion !== 0) {
        const { OptimisticConcurrencyError } = await import("@moonship/access");
        throw new OptimisticConcurrencyError(
          `Concurrent update on property access ${access.propertyId}`,
        );
      }
      access.pullEvents();
      this.aggregates.set(
        access.propertyId,
        PropertyAccess.reconstitute({
          propertyId: access.propertyId,
          memberships: access.memberships,
          version: access.version,
        }),
      );
    },
  };

  adminRepository: PlatformAdminRepository = {
    findByAuthUserId: (authUserId: string) => {
      for (const admin of this.admins.values()) {
        if (admin.authUserId === authUserId) {
          return Promise.resolve(
            PlatformAdmin.reconstitute({
              id: admin.id,
              email: admin.email,
              authUserId: admin.authUserId,
            }),
          );
        }
      }
      return Promise.resolve(null);
    },
    claimByEmail: (email: string, authUserId: string) => {
      const normalized = email.trim().toLowerCase();
      for (const admin of this.admins.values()) {
        if (admin.email === normalized) {
          if (admin.authUserId) return Promise.resolve(false);
          this.admins.set(
            admin.id,
            PlatformAdmin.reconstitute({
              id: admin.id,
              email: admin.email,
              authUserId,
            }),
          );
          return Promise.resolve(true);
        }
      }
      return Promise.resolve(false);
    },
  };

  queries: AccessQueries = {
    getMemberships: (propertyId: string) =>
      Promise.resolve(this.list(propertyId)),
    listByAuthUserId: (authUserId: string) =>
      Promise.resolve(
        this.allMemberships().filter((m) => m.authUserId === authUserId),
      ),
    listUnclaimedPropertyIdsByEmail: (email: string) => {
      const normalized = email.trim().toLowerCase();
      const ids = new Set<string>();
      for (const m of this.allMemberships()) {
        if (m.email === normalized && !m.authUserId) {
          ids.add(m.propertyId);
        }
      }
      return Promise.resolve([...ids]);
    },
  };

  private list(propertyId: string): MembershipView[] {
    return this.allMemberships().filter((v) => v.propertyId === propertyId);
  }

  private allMemberships(): MembershipView[] {
    const views: MembershipView[] = [];
    for (const access of this.aggregates.values()) {
      for (const m of access.memberships) {
        views.push({
          id: m.id,
          propertyId: access.propertyId,
          email: m.email,
          role: m.role,
          status: m.status,
          authUserId: m.authUserId ?? null,
        });
      }
    }
    return views;
  }

  seed(access: PropertyAccess): void {
    access.pullEvents();
    this.aggregates.set(access.propertyId, access);
  }

  seedAdmin(admin: PlatformAdmin): void {
    this.admins.set(admin.id, admin);
  }
}

const STUB_ADDRESS = {
  street1: "1 Test St",
  city: "Testville",
  state: "TS",
  postalCode: "00000",
  country: "US",
};

export class InMemoryPropertyQueries implements PropertyQueries {
  constructor(private names: Map<string, string>) {}

  getById(id: string): Promise<PropertyView | null> {
    const name = this.names.get(id);
    if (name === undefined) return Promise.resolve(null);
    return Promise.resolve({ id, name, address: { ...STUB_ADDRESS } });
  }

  async listByIds(ids: string[]): Promise<PropertyView[]> {
    const views: PropertyView[] = [];
    for (const id of ids) {
      const view = await this.getById(id);
      if (view) views.push(view);
    }
    return views;
  }

  async list(): Promise<PropertyView[]> {
    const views: PropertyView[] = [];
    for (const [id] of this.names) {
      const view = await this.getById(id);
      if (view) views.push(view);
    }
    return views;
  }
}

export function seedAccess(
  propertyId: string,
  memberships: {
    id: string;
    email: string;
    role: "admin" | "staff";
    status?: "active" | "revoked";
    authUserId?: string | null;
  }[],
): PropertyAccess {
  return PropertyAccess.reconstitute({
    propertyId,
    memberships: memberships.map((m) => ({
      id: m.id,
      email: m.email.trim().toLowerCase(),
      role: m.role,
      status: m.status ?? "active",
      authUserId: m.authUserId ?? null,
    })),
    version: memberships.length,
  });
}
