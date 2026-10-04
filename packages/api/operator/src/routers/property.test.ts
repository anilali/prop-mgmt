import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { Property, PropertyRepository } from "@moonship/property";
import { PlatformAdmin } from "@moonship/access";

import type { Operator } from "../operator";
import { loadRequestAccess } from "../operator-context";
import {
  InMemoryAccessStore,
  InMemoryPropertyQueries,
  seedAccess,
} from "../test-access-store";
import { createCallerFactory } from "../trpc";
import { propertyRouter } from "./property";

const PROPERTY_A = "11111111-1111-4111-8111-111111111111";
const PROPERTY_B = "22222222-2222-4222-8222-222222222222";
const ADMIN_M = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

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

const ADDRESS = {
  street1: "1 Test St",
  city: "Testville",
  state: "TS",
  postalCode: "00000",
  country: "US",
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

function seedPropertyAdmin(store: InMemoryAccessStore) {
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
}

async function propertyCaller(
  store: InMemoryAccessStore,
  names: Map<string, string>,
  operator: Operator,
) {
  const propertyQueries = new InMemoryPropertyQueries(names);
  const propertyRepository: PropertyRepository = {
    findById: () => Promise.resolve(null),
    save: (property: Property) => {
      names.set(property.id, property.name);
      return Promise.resolve();
    },
  };
  const access = await loadRequestAccess(
    {
      accessQueries: store.queries,
      platformAdminRepository: store.adminRepository,
      propertyQueries,
    },
    { operator, cookieValue: null },
  );
  return createCallerFactory(
    propertyRouter({ propertyRepository, propertyQueries }),
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

describe("property platform procedures", () => {
  it("list, getForPlatform, and register reject a non-platform-admin with admin memberships", async () => {
    const store = new InMemoryAccessStore();
    seedPropertyAdmin(store);
    const names = new Map([[PROPERTY_A, "Alpha Property"]]);
    const caller = await propertyCaller(store, names, ADMIN);

    expect(await codeOf(caller.list())).toBe("FORBIDDEN");
    expect(
      await codeOf(caller.getForPlatform({ propertyId: PROPERTY_A })),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(caller.register({ name: "New", address: ADDRESS })),
    ).toBe("FORBIDDEN");
  });

  it("list returns every property sorted by name", async () => {
    const store = new InMemoryAccessStore();
    seedPlatformAdmin(store);
    const names = new Map([
      [PROPERTY_B, "Beta Property"],
      [PROPERTY_A, "alpha property"],
    ]);
    const caller = await propertyCaller(store, names, ROOT);

    const properties = await caller.list();
    expect(properties.map((p) => p.id)).toEqual([PROPERTY_A, PROPERTY_B]);
  });

  it("getForPlatform returns the property or NOT_FOUND", async () => {
    const store = new InMemoryAccessStore();
    seedPlatformAdmin(store);
    const names = new Map([[PROPERTY_A, "Alpha Property"]]);
    const caller = await propertyCaller(store, names, ROOT);

    const property = await caller.getForPlatform({ propertyId: PROPERTY_A });
    expect(property.name).toBe("Alpha Property");
    expect(
      await codeOf(caller.getForPlatform({ propertyId: UNKNOWN_ID })),
    ).toBe("NOT_FOUND");
  });

  it("register creates the property and no PropertyAccess", async () => {
    const store = new InMemoryAccessStore();
    seedPlatformAdmin(store);
    const names = new Map([[PROPERTY_A, "Alpha Property"]]);
    const caller = await propertyCaller(store, names, ROOT);

    const created = await caller.register({
      name: "Beta Property",
      address: ADDRESS,
    });
    expect(created.name).toBe("Beta Property");
    expect(names.get(created.id)).toBe("Beta Property");
    expect(await store.repository.findByPropertyId(created.id)).toBeNull();
  });
});
