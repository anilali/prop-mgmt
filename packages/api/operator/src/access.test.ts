import { describe, expect, it, vi } from "vitest";

import type { PropertyAccess } from "@moonship/access";
import { OptimisticConcurrencyError, PlatformAdmin } from "@moonship/access";

import { claimAccessOnSignIn } from "./access";
import { InMemoryAccessStore, seedAccess } from "./test-access-store";

const PROPERTY_A = "11111111-1111-4111-8111-111111111111";
const PROPERTY_B = "22222222-2222-4222-8222-222222222222";

function deps(store: InMemoryAccessStore) {
  return {
    propertyAccessRepository: store.repository,
    platformAdminRepository: store.adminRepository,
    accessQueries: store.queries,
  };
}

describe("claimAccessOnSignIn", () => {
  it("claims unclaimed memberships across properties by email", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        {
          id: "m-1",
          email: "Newbie@Example.com",
          role: "staff",
          authUserId: null,
        },
      ]),
    );
    store.seed(
      seedAccess(PROPERTY_B, [
        { id: "m-2", email: "newbie@example.com", role: "admin" },
      ]),
    );

    const result = await claimAccessOnSignIn(deps(store), {
      authUserId: "auth-newbie",
      email: " newbie@example.COM ",
      name: "Newbie",
    });

    expect(result.claimedMembershipIds).toEqual(
      expect.arrayContaining(["m-1", "m-2"]),
    );
    expect(result.claimedPlatformAdmin).toBe(false);
    const claimed = await store.queries.listByAuthUserId("auth-newbie");
    expect(claimed.map((m) => m.id)).toEqual(
      expect.arrayContaining(["m-1", "m-2"]),
    );
  });

  it("claims a matching unclaimed platform admin record", async () => {
    const store = new InMemoryAccessStore();
    store.seedAdmin(
      PlatformAdmin.reconstitute({
        id: "pa-1",
        email: "root@example.com",
        authUserId: null,
      }),
    );

    const result = await claimAccessOnSignIn(deps(store), {
      authUserId: "auth-root",
      email: "root@example.com",
      name: "Root",
    });

    expect(result.claimedPlatformAdmin).toBe(true);
    expect(
      (await store.adminRepository.findByAuthUserId("auth-root"))?.id,
    ).toBe("pa-1");
  });

  it("never rebinds an already-claimed membership or admin record", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        {
          id: "m-1",
          email: "op@example.com",
          role: "staff",
          authUserId: "auth-op",
        },
      ]),
    );
    store.seedAdmin(
      PlatformAdmin.reconstitute({
        id: "pa-1",
        email: "root@example.com",
        authUserId: "auth-root",
      }),
    );

    const result = await claimAccessOnSignIn(deps(store), {
      authUserId: "auth-impostor",
      email: "op@example.com",
      name: "Impostor",
    });

    expect(result).toEqual({
      claimedMembershipIds: [],
      claimedPlatformAdmin: false,
    });
    const kept = await store.queries.listByAuthUserId("auth-op");
    expect(kept.map((m) => m.id)).toEqual(["m-1"]);

    const second = await claimAccessOnSignIn(deps(store), {
      authUserId: "auth-impostor-admin",
      email: "root@example.com",
      name: "Impostor Admin",
    });

    expect(second).toEqual({
      claimedMembershipIds: [],
      claimedPlatformAdmin: false,
    });
    const admin = await store.adminRepository.findByAuthUserId("auth-root");
    expect(admin?.email).toBe("root@example.com");
  });

  it("returns empty claims when nothing matches", async () => {
    const store = new InMemoryAccessStore();
    const result = await claimAccessOnSignIn(deps(store), {
      authUserId: "auth-stranger",
      email: "stranger@example.com",
      name: "Stranger",
    });
    expect(result).toEqual({
      claimedMembershipIds: [],
      claimedPlatformAdmin: false,
    });
  });

  it("logs and continues when one property save conflicts", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        { id: "m-1", email: "op@example.com", role: "staff" },
      ]),
    );
    store.seed(
      seedAccess(PROPERTY_B, [
        { id: "m-2", email: "op@example.com", role: "admin" },
      ]),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const base = deps(store);
      const d = {
        ...base,
        propertyAccessRepository: {
          ...base.propertyAccessRepository,
          save: async (access: PropertyAccess, expectedVersion: number) => {
            if (access.propertyId === PROPERTY_A) {
              throw new OptimisticConcurrencyError(
                `Concurrent update on property access ${PROPERTY_A}`,
              );
            }
            return base.propertyAccessRepository.save(access, expectedVersion);
          },
        },
      };

      const result = await claimAccessOnSignIn(d, {
        authUserId: "auth-op",
        email: "op@example.com",
        name: "Op",
      });

      expect(result.claimedMembershipIds).toEqual(["m-2"]);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it("is not exposed through any client-callable router", async () => {
    const { accessRouter } = await import("./routers/access");
    const { propertyRouter } = await import("./routers/property");
    const procedureNames = [
      ...Object.keys(accessRouter({} as never)),
      ...Object.keys(propertyRouter({} as never)),
    ];
    expect(procedureNames).not.toContain("claimAccessOnSignIn");
  });
});
