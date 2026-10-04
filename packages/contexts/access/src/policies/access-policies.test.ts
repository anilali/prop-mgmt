import { describe, expect, it } from "vitest";

import type { AccessState, AccessSubject } from "./access-policies";
import { PlatformAdmin } from "../entities/platform-admin";
import {
  canManageAccess,
  canOperate,
  canRegisterProperty,
  isPlatformAdmin,
} from "./access-policies";

const PROPERTY_A = "11111111-1111-4111-8111-111111111111";
const PROPERTY_B = "22222222-2222-4222-8222-222222222222";

function subject(overrides: Partial<AccessSubject> = {}): AccessSubject {
  return {
    authUserId: "auth-op",
    email: "op@example.com",
    ...overrides,
  };
}

function stateWith(overrides: Partial<AccessState> = {}): AccessState {
  return {
    platformAdmins: [
      PlatformAdmin.reconstitute({
        id: "pa-1",
        email: "root@example.com",
        authUserId: "auth-root",
      }),
    ],
    memberships: [
      {
        propertyId: PROPERTY_A,
        email: "admin@example.com",
        authUserId: "auth-admin",
        role: "admin",
        status: "active",
      },
      {
        propertyId: PROPERTY_A,
        email: "staff@example.com",
        authUserId: "auth-staff",
        role: "staff",
        status: "active",
      },
      {
        propertyId: PROPERTY_A,
        email: "former@example.com",
        authUserId: null,
        role: "staff",
        status: "revoked",
      },
    ],
    ...overrides,
  };
}

describe("access policies", () => {
  describe("isPlatformAdmin", () => {
    it("matches a claimed platform admin by authUserId, not email", () => {
      expect(
        isPlatformAdmin(
          subject({ authUserId: "auth-root", email: "anyone@example.com" }),
          stateWith(),
        ),
      ).toBe(true);
      expect(
        isPlatformAdmin(
          subject({ authUserId: "auth-other", email: "root@example.com" }),
          stateWith(),
        ),
      ).toBe(false);
    });

    it("ignores unclaimed platform admin records", () => {
      const state = stateWith({
        platformAdmins: [
          PlatformAdmin.reconstitute({
            id: "pa-2",
            email: "pending@example.com",
            authUserId: null,
          }),
        ],
      });
      expect(
        isPlatformAdmin(
          subject({ authUserId: "auth-x", email: "pending@example.com" }),
          state,
        ),
      ).toBe(false);
    });
  });

  describe("canOperate", () => {
    it("allows active claimed members on that property, any role", () => {
      const state = stateWith();
      expect(
        canOperate(
          subject({ authUserId: "auth-staff", email: "staff@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(true);
      expect(
        canOperate(
          subject({ authUserId: "auth-admin", email: "other@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(true);
    });

    it("denies platform admins without a membership on the property", () => {
      expect(
        canOperate(
          subject({ authUserId: "auth-root", email: "root@example.com" }),
          PROPERTY_A,
          stateWith(),
        ),
      ).toBe(false);
    });

    it("is scoped to one property", () => {
      expect(
        canOperate(
          subject({ authUserId: "auth-staff", email: "staff@example.com" }),
          PROPERTY_B,
          stateWith(),
        ),
      ).toBe(false);
    });

    it("denies revoked members, unclaimed emails, and strangers", () => {
      const state = stateWith();
      expect(
        canOperate(
          subject({ authUserId: "auth-x", email: "former@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(false);
      expect(
        canOperate(
          subject({ authUserId: "", email: "staff@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(false);
      expect(
        canOperate(
          subject({ authUserId: "auth-x", email: "stranger@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(false);
    });
  });

  describe("canManageAccess", () => {
    it("allows platform admins on any property", () => {
      expect(
        canManageAccess(
          subject({ authUserId: "auth-root", email: "root@example.com" }),
          PROPERTY_B,
          stateWith(),
        ),
      ).toBe(true);
    });

    it("allows active admin members only on their property", () => {
      const state = stateWith();
      expect(
        canManageAccess(
          subject({ authUserId: "auth-admin", email: "admin@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(true);
      expect(
        canManageAccess(
          subject({ authUserId: "auth-admin", email: "admin@example.com" }),
          PROPERTY_B,
          state,
        ),
      ).toBe(false);
    });

    it("denies active non-admin members", () => {
      const state = stateWith();
      expect(
        canManageAccess(
          subject({ authUserId: "auth-staff", email: "staff@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(false);
      expect(
        canManageAccess(
          subject({ authUserId: "auth-x", email: "former@example.com" }),
          PROPERTY_A,
          state,
        ),
      ).toBe(false);
    });
  });

  describe("canRegisterProperty", () => {
    it("allows platform admins only", () => {
      const state = stateWith();
      expect(
        canRegisterProperty(
          subject({ authUserId: "auth-root", email: "root@example.com" }),
          state,
        ),
      ).toBe(true);
      expect(
        canRegisterProperty(
          subject({ authUserId: "auth-admin", email: "admin@example.com" }),
          state,
        ),
      ).toBe(false);
      expect(
        canRegisterProperty(
          subject({ authUserId: "auth-x", email: "stranger@example.com" }),
          state,
        ),
      ).toBe(false);
    });
  });
});
