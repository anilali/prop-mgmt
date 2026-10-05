import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { PlatformAdmin } from "@moonship/access";

import type { Operator } from "../operator";
import { loadRequestAccess } from "../operator-context";
import {
  InMemoryAccessStore,
  InMemoryPropertyQueries,
  seedAccess,
} from "../test-access-store";
import { createCallerFactory } from "../trpc";
import { accessRouter } from "./access";
import { propertyRouter } from "./property";

const PROPERTY_A = "11111111-1111-4111-8111-111111111111";
const PROPERTY_B = "22222222-2222-4222-8222-222222222222";
const ADMIN_M = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF_M = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REVOKED_M = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const PROPERTY_NAMES = new Map([
  [PROPERTY_A, "Alpha Property"],
  [PROPERTY_B, "Beta Property"],
]);

const ROOT: Operator = {
  authUserId: "auth-root",
  email: "root@example.com",
  name: "Root",
};

const ADMIN: Operator = {
  authUserId: "auth-admin",
  email: "admin@example.com",
  name: "Admin",
};

const STAFF: Operator = {
  authUserId: "auth-staff",
  email: "staff@example.com",
  name: "Staff",
};

const STRANGER: Operator = {
  authUserId: "auth-x",
  email: "x@example.com",
  name: "X",
};

function seedPlatformAdmin(store: InMemoryAccessStore) {
  store.seedAdmin(
    PlatformAdmin.reconstitute({
      id: "pa-root",
      email: "root@example.com",
      authUserId: "auth-root",
    }),
  );
}

function seedPropertyA(store: InMemoryAccessStore) {
  store.seed(
    seedAccess(PROPERTY_A, [
      {
        id: ADMIN_M,
        email: "admin@example.com",
        role: "admin",
        authUserId: "auth-admin",
      },
      {
        id: STAFF_M,
        email: "staff@example.com",
        role: "staff",
        authUserId: "auth-staff",
      },
      {
        id: REVOKED_M,
        email: "former@example.com",
        role: "staff",
        status: "revoked",
      },
    ]),
  );
}

async function accessCaller(
  store: InMemoryAccessStore,
  operator: Operator,
  cookieValue: string | null = null,
) {
  const access = await loadRequestAccess(
    {
      accessQueries: store.queries,
      platformAdminRepository: store.adminRepository,
      propertyQueries: new InMemoryPropertyQueries(PROPERTY_NAMES),
    },
    { operator, cookieValue },
  );
  return createCallerFactory(
    accessRouter({
      propertyAccessRepository: store.repository,
      accessQueries: store.queries,
    }),
  )({ access });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    return (error as TRPCError).code;
  }
  throw new Error("expected procedure to throw");
}

describe("access membership procedures", () => {
  it("grant provisions a new membership", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const caller = await accessCaller(store, ADMIN);

    const created = await caller.grant({
      propertyId: PROPERTY_A,
      email: "newbie@example.com",
      role: "staff",
    });
    expect(created.email).toBe("newbie@example.com");
    expect(created.role).toBe("staff");
    expect(created.status).toBe("active");
  });

  it("grant reactivates a revoked membership with the new role", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    seedPlatformAdmin(store);
    const caller = await accessCaller(store, ROOT);

    const reactivated = await caller.grant({
      propertyId: PROPERTY_A,
      email: "former@example.com",
      role: "admin",
    });
    expect(reactivated.id).toBe(REVOKED_M);
    expect(reactivated.status).toBe("active");
    expect(reactivated.role).toBe("admin");
  });

  it("grant conflicts on an already-active membership", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const caller = await accessCaller(store, ADMIN);

    expect(
      await codeOf(
        caller.grant({
          propertyId: PROPERTY_A,
          email: "staff@example.com",
          role: "staff",
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("grant to a revoked email keeps membershipId and authUserId", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_B, [
        {
          id: REVOKED_M,
          email: "former@example.com",
          role: "staff",
          status: "revoked",
          authUserId: "auth-former",
        },
      ]),
    );
    seedPlatformAdmin(store);
    const caller = await accessCaller(store, ROOT);

    const reactivated = await caller.grant({
      propertyId: PROPERTY_B,
      email: "former@example.com",
      role: "admin",
    });
    expect(reactivated.id).toBe(REVOKED_M);
    expect(reactivated.status).toBe("active");
    expect(reactivated.role).toBe("admin");
    expect(reactivated.authUserId).toBe("auth-former");
  });

  it("an unclaimed membership grants no access until the sign-in claim", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        {
          id: ADMIN_M,
          email: "admin@example.com",
          role: "admin",
          authUserId: null,
        },
      ]),
    );
    const caller = await accessCaller(store, ADMIN);

    expect(await codeOf(caller.list({ propertyId: PROPERTY_A }))).toBe(
      "FORBIDDEN",
    );
  });

  it("a staff first grant is rejected while the property has no admin", async () => {
    const store = new InMemoryAccessStore();
    seedPlatformAdmin(store);
    const caller = await accessCaller(store, ROOT);

    expect(
      await codeOf(
        caller.grant({
          propertyId: PROPERTY_B,
          email: "staff@example.com",
          role: "staff",
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("an admin first grant succeeds and a later staff grant succeeds", async () => {
    const store = new InMemoryAccessStore();
    seedPlatformAdmin(store);
    const caller = await accessCaller(store, ROOT);

    const admin = await caller.grant({
      propertyId: PROPERTY_B,
      email: "admin@example.com",
      role: "admin",
    });
    expect(admin.status).toBe("active");
    expect(admin.role).toBe("admin");

    const staff = await caller.grant({
      propertyId: PROPERTY_B,
      email: "staff@example.com",
      role: "staff",
    });
    expect(staff.status).toBe("active");
    expect(staff.role).toBe("staff");
  });

  it("grant, changeRole, revoke, and list are manage-only", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const staffCaller = await accessCaller(store, STAFF);
    const strangerCaller = await accessCaller(store, STRANGER);

    expect(
      await codeOf(
        staffCaller.grant({
          propertyId: PROPERTY_A,
          email: "n@example.com",
          role: "staff",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        staffCaller.changeRole({
          propertyId: PROPERTY_A,
          membershipId: STAFF_M,
          role: "admin",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        staffCaller.revoke({ propertyId: PROPERTY_A, membershipId: STAFF_M }),
      ),
    ).toBe("FORBIDDEN");
    expect(await codeOf(staffCaller.list({ propertyId: PROPERTY_A }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(strangerCaller.list({ propertyId: PROPERTY_A }))).toBe(
      "FORBIDDEN",
    );
  });

  it("a property admin cannot manage another property (forged propertyId)", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const caller = await accessCaller(store, ADMIN);

    expect(
      await codeOf(
        caller.grant({
          propertyId: PROPERTY_B,
          email: "n@example.com",
          role: "staff",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(await codeOf(caller.list({ propertyId: PROPERTY_B }))).toBe(
      "FORBIDDEN",
    );
  });

  it("a stale cookie falls back to an operable property instead of throwing", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const access = await loadRequestAccess(
      {
        accessQueries: store.queries,
        platformAdminRepository: store.adminRepository,
        propertyQueries: new InMemoryPropertyQueries(PROPERTY_NAMES),
      },
      { operator: ADMIN, cookieValue: PROPERTY_B },
    );
    const caller = createCallerFactory(
      propertyRouter({
        propertyRepository: {} as never,
        propertyQueries: new InMemoryPropertyQueries(PROPERTY_NAMES),
        accountQueries: {} as never,
        billingQueries: {} as never,
        unitOfWork: {} as never,
      }),
    )({ access });

    const property = await caller.get();
    expect(property.id).toBe(PROPERTY_A);
  });

  it("an operator without access cannot read a property", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const access = await loadRequestAccess(
      {
        accessQueries: store.queries,
        platformAdminRepository: store.adminRepository,
        propertyQueries: new InMemoryPropertyQueries(PROPERTY_NAMES),
      },
      { operator: STRANGER, cookieValue: null },
    );
    const caller = createCallerFactory(
      propertyRouter({
        propertyRepository: {} as never,
        propertyQueries: new InMemoryPropertyQueries(PROPERTY_NAMES),
        accountQueries: {} as never,
        billingQueries: {} as never,
        unitOfWork: {} as never,
      }),
    )({ access });

    expect(await codeOf(caller.get())).toBe("FORBIDDEN");
  });

  it("changeRole updates the role", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const caller = await accessCaller(store, ADMIN);

    await caller.changeRole({
      propertyId: PROPERTY_A,
      membershipId: STAFF_M,
      role: "admin",
    });
    const reloadedStaff = await store.repository.findByPropertyId(PROPERTY_A);
    expect(reloadedStaff?.findByEmail("staff@example.com")?.role).toBe("admin");
  });

  it("changeRole blocks demoting the last active admin", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        {
          id: ADMIN_M,
          email: "admin@example.com",
          role: "admin",
          authUserId: "auth-admin",
        },
      ]),
    );
    const caller = await accessCaller(store, ADMIN);

    expect(
      await codeOf(
        caller.changeRole({
          propertyId: PROPERTY_A,
          membershipId: ADMIN_M,
          role: "staff",
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    const reloadedAdmin = await store.repository.findByPropertyId(PROPERTY_A);
    expect(reloadedAdmin?.findByEmail("admin@example.com")?.role).toBe("admin");
  });

  it("revoke blocks removing the last active admin", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        {
          id: ADMIN_M,
          email: "admin@example.com",
          role: "admin",
          authUserId: "auth-admin",
        },
      ]),
    );
    const caller = await accessCaller(store, ADMIN);

    expect(
      await codeOf(
        caller.revoke({ propertyId: PROPERTY_A, membershipId: ADMIN_M }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("revoke deactivates but the list still includes the revoked row", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    const caller = await accessCaller(store, ADMIN);

    await caller.revoke({ propertyId: PROPERTY_A, membershipId: STAFF_M });
    const members = await caller.list({ propertyId: PROPERTY_A });
    expect(members.length).toBe(3);
    expect(members.find((m) => m.id === STAFF_M)?.status).toBe("revoked");
  });

  it("platform admins can manage any property", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyA(store);
    seedPlatformAdmin(store);
    const caller = await accessCaller(store, ROOT);

    const members = await caller.list({ propertyId: PROPERTY_A });
    expect(members.length).toBe(3);
  });
});
