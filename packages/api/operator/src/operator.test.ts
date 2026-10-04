import { describe, expect, it } from "vitest";

import { mapSessionToOperator } from "./operator";
import { loadRequestAccess } from "./operator-context";
import {
  InMemoryAccessStore,
  InMemoryPropertyQueries,
  seedAccess,
} from "./test-access-store";

const PROPERTY_A = "11111111-1111-4111-8111-111111111111";
const PROPERTY_NAMES = new Map([[PROPERTY_A, "Alpha Property"]]);

function session(userId: string, email: string) {
  return { user: { id: userId, name: "Op", email } };
}

describe("mapSessionToOperator", () => {
  it("returns null when there is no session", () => {
    expect(mapSessionToOperator(null)).toBeNull();
  });

  it("maps identity from the Better Auth session user, never a role", () => {
    expect(mapSessionToOperator(session("user-1", "op@example.com"))).toEqual({
      authUserId: "user-1",
      email: "op@example.com",
      name: "Op",
    });
  });
});

describe("loadRequestAccess", () => {
  it("resolves property context from claimed memberships", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        {
          id: "m-1",
          email: "op@example.com",
          role: "admin",
          authUserId: "auth-op",
        },
      ]),
    );
    const operator = mapSessionToOperator(session("auth-op", "op@example.com"));
    if (!operator) throw new Error("expected an operator");

    const access = await loadRequestAccess(
      {
        accessQueries: store.queries,
        platformAdminRepository: store.adminRepository,
        propertyQueries: new InMemoryPropertyQueries(PROPERTY_NAMES),
      },
      { operator, cookieValue: null },
    );

    expect(access.operableProperties).toEqual([
      { id: PROPERTY_A, name: "Alpha Property", role: "admin" },
    ]);
    expect(access.context).toEqual({
      mode: "property",
      propertyId: PROPERTY_A,
      propertyName: "Alpha Property",
      role: "admin",
    });
  });

  it("ignores membership rows that are not yet claimed", async () => {
    const store = new InMemoryAccessStore();
    store.seed(
      seedAccess(PROPERTY_A, [
        {
          id: "m-1",
          email: "op@example.com",
          role: "admin",
          authUserId: null,
        },
      ]),
    );
    const operator = mapSessionToOperator(session("auth-op", "op@example.com"));
    if (!operator) throw new Error("expected an operator");

    const access = await loadRequestAccess(
      {
        accessQueries: store.queries,
        platformAdminRepository: store.adminRepository,
        propertyQueries: new InMemoryPropertyQueries(PROPERTY_NAMES),
      },
      { operator, cookieValue: null },
    );

    expect(access.operableProperties).toEqual([]);
    expect(access.context).toEqual({ mode: "no-access" });
  });
});
