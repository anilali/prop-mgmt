import { describe, expect, it } from "vitest";

import type {
  MembershipClaimed,
  MembershipGranted,
  MembershipReactivated,
  MembershipRevoked,
  MembershipRoleChanged,
} from "../events/access-events";
import type { MembershipProps } from "./property-access";
import { EmailAddress } from "../value-objects/email-address";
import { PropertyAccess } from "./property-access";

function buildAccess(memberships: MembershipProps[] = []): PropertyAccess {
  return PropertyAccess.reconstitute({
    propertyId: "property-1",
    memberships,
    version: memberships.length,
  });
}

const ACTOR = "auth-actor";

function activeAdmin(
  overrides: Partial<MembershipProps> = {},
): MembershipProps {
  return {
    id: "membership-admin",
    email: "admin@example.com",
    role: "admin",
    status: "active",
    authUserId: "auth-admin",
    ...overrides,
  };
}

describe("EmailAddress", () => {
  it("trims and lowercases", () => {
    expect(EmailAddress.parse("  Admin@Example.COM ").value).toBe(
      "admin@example.com",
    );
  });

  it("rejects invalid addresses", () => {
    expect(() => EmailAddress.parse("not-an-email")).toThrow(
      "Invalid email address",
    );
    expect(() => EmailAddress.parse("a@b")).toThrow("Invalid email address");
  });
});

describe("PropertyAccess invariants", () => {
  describe("invariant 1: emails are stored normalized", () => {
    it("trims and lowercases the membership email on grant", () => {
      const access = PropertyAccess.create({ propertyId: "property-1" });
      access.grantMembership({
        membershipId: "m-1",
        email: "  Ops@Example.COM ",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });

      expect(access.findByEmail("ops@example.com")?.email).toBe(
        "ops@example.com",
      );
      const event = access.pullEvents()[0] as MembershipGranted;
      expect(event.payload.email).toBe("ops@example.com");
      expect(event.payload.actedByAuthUserId).toBe(ACTOR);
    });

    it("matches existing memberships case-insensitively", () => {
      const access = buildAccess([activeAdmin()]);
      expect(access.findByEmail(" ADMIN@EXAMPLE.com ")?.id).toBe(
        "membership-admin",
      );
    });
  });

  describe("invariant 2: one membership per normalized email", () => {
    it("rejects granting a duplicate email regardless of casing", () => {
      const access = buildAccess([activeAdmin()]);
      expect(() =>
        access.grantMembership({
          membershipId: "m-2",
          email: "ADMIN@example.com",
          role: "staff",
          actedByAuthUserId: ACTOR,
        }),
      ).toThrow("Membership already exists for admin@example.com");
    });

    it("rejects re-granting a revoked email (reactivate instead)", () => {
      const access = buildAccess([
        activeAdmin(),
        {
          id: "m-revoked",
          email: "former@example.com",
          role: "staff",
          status: "revoked",
          authUserId: null,
        },
      ]);
      expect(() =>
        access.grantMembership({
          membershipId: "m-new",
          email: "former@example.com",
          role: "staff",
          actedByAuthUserId: ACTOR,
        }),
      ).toThrow("Membership already exists for former@example.com");
    });

    it("allows the same email on different properties", () => {
      const other = PropertyAccess.create({ propertyId: "property-2" });
      other.grantMembership({
        membershipId: "m-1",
        email: "admin@example.com",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });
      expect(other.findByEmail("admin@example.com")).not.toBeNull();
    });
  });

  describe("invariant 3: revoked memberships return only via reactivate", () => {
    it("rejects role changes on revoked memberships", () => {
      const access = buildAccess([
        {
          id: "m-revoked",
          email: "former@example.com",
          role: "staff",
          status: "revoked",
          authUserId: null,
        },
      ]);
      expect(() =>
        access.changeMembershipRole("m-revoked", "admin", ACTOR),
      ).toThrow(
        "Cannot change role on revoked membership m-revoked; reactivate it first",
      );
    });

    it("rejects revoking an already-revoked membership", () => {
      const access = buildAccess([
        {
          id: "m-revoked",
          email: "former@example.com",
          role: "staff",
          status: "revoked",
          authUserId: null,
        },
      ]);
      expect(() => access.revokeMembership("m-revoked", ACTOR)).toThrow(
        "Cannot revoke revoked membership m-revoked; reactivate it first",
      );
    });

    it("reactivates a revoked membership and emits MembershipReactivated", () => {
      const access = buildAccess([
        activeAdmin(),
        {
          id: "m-revoked",
          email: "former@example.com",
          role: "staff",
          status: "revoked",
          authUserId: null,
        },
      ]);
      access.reactivateMembership("m-revoked", "admin", ACTOR);

      expect(access.findByEmail("former@example.com")?.status).toBe("active");
      expect(access.findByEmail("former@example.com")?.role).toBe("admin");
      const events = access.pullEvents();
      expect(events).toHaveLength(1);
      const reactivated = events[0] as MembershipReactivated;
      expect(reactivated.eventType).toBe("MembershipReactivated");
      expect(reactivated.payload).toEqual({
        role: "admin",
        actedByAuthUserId: ACTOR,
      });
    });

    it("reactivating an active membership throws", () => {
      const access = buildAccess([activeAdmin()]);
      expect(() =>
        access.reactivateMembership("membership-admin", "admin", ACTOR),
      ).toThrow("Membership membership-admin is already active");
      expect(access.pullEvents()).toHaveLength(0);
    });
  });

  describe("invariant 4: every event carries propertyId, aggregateId, membershipId", () => {
    it("attaches all three ids on grant, role change, revoke, and claim", () => {
      const access = PropertyAccess.create({ propertyId: "property-1" });
      access.grantMembership({
        membershipId: "m-1",
        email: "ops@example.com",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });
      access.grantMembership({
        membershipId: "m-2",
        email: "other@example.com",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });
      access.changeMembershipRole("m-1", "staff", ACTOR);
      access.revokeMembership("m-1", ACTOR);
      access.claimMemberships("other@example.com", "auth-other");

      const events = access.pullEvents();
      expect(events).toHaveLength(5);
      expect(events.map((e) => e.eventType)).toEqual([
        "MembershipGranted",
        "MembershipGranted",
        "MembershipRoleChanged",
        "MembershipRevoked",
        "MembershipClaimed",
      ]);
      for (const event of events) {
        expect(event.aggregateId).toBe("property-1");
        const accessEvent = event as unknown as {
          propertyId: string;
          membershipId: string;
        };
        expect(accessEvent.propertyId).toBe("property-1");
        expect(typeof accessEvent.membershipId).toBe("string");
      }
      const granted = events[0] as MembershipGranted;
      expect(granted.membershipId).toBe("m-1");
      const roleChanged = events[2] as MembershipRoleChanged;
      expect(roleChanged.membershipId).toBe("m-1");
      expect(roleChanged.payload).toEqual({
        role: "staff",
        actedByAuthUserId: ACTOR,
      });
      const revoked = events[3] as MembershipRevoked;
      expect(revoked.membershipId).toBe("m-1");
      expect(revoked.payload).toEqual({ actedByAuthUserId: ACTOR });
      const claimed = events[4] as MembershipClaimed;
      expect(claimed.membershipId).toBe("m-2");
      expect(claimed.payload).toEqual({ authUserId: "auth-other" });
    });
  });

  describe("last-admin block", () => {
    it("rejects revoking the last active admin", () => {
      const access = buildAccess([activeAdmin()]);
      expect(() => access.revokeMembership("membership-admin", ACTOR)).toThrow(
        "Cannot remove the last active admin on property property-1",
      );
      expect(access.findByEmail("admin@example.com")?.status).toBe("active");
    });

    it("rejects demoting the last active admin", () => {
      const access = buildAccess([activeAdmin()]);
      expect(() =>
        access.changeMembershipRole("membership-admin", "staff", ACTOR),
      ).toThrow("Cannot remove the last active admin on property property-1");
      expect(access.findByEmail("admin@example.com")?.role).toBe("admin");
    });

    it("allows revoking one admin while another remains", () => {
      const access = buildAccess([
        activeAdmin(),
        activeAdmin({
          id: "membership-admin-2",
          email: "admin2@example.com",
          authUserId: "auth-admin-2",
        }),
      ]);
      access.revokeMembership("membership-admin-2", ACTOR);

      expect(access.findByEmail("admin2@example.com")?.status).toBe("revoked");
      expect(access.findByEmail("admin@example.com")?.status).toBe("active");
    });

    it("allows demoting one admin while another remains", () => {
      const access = buildAccess([
        activeAdmin(),
        activeAdmin({
          id: "membership-admin-2",
          email: "admin2@example.com",
          authUserId: "auth-admin-2",
        }),
      ]);
      access.changeMembershipRole("membership-admin", "staff", ACTOR);

      expect(access.findByEmail("admin@example.com")?.role).toBe("staff");
      expect(access.findByEmail("admin2@example.com")?.role).toBe("admin");
    });

    it("ignores revoked admins when counting remaining admins", () => {
      const access = buildAccess([
        activeAdmin(),
        {
          id: "m-revoked-admin",
          email: "old-admin@example.com",
          role: "admin",
          status: "revoked",
          authUserId: null,
        },
      ]);
      expect(() => access.revokeMembership("membership-admin", ACTOR)).toThrow(
        "Cannot remove the last active admin",
      );
    });
  });

  describe("first grant must be an admin", () => {
    it("rejects a staff first grant on a new property", () => {
      const access = PropertyAccess.create({ propertyId: "property-1" });
      expect(() =>
        access.grantMembership({
          membershipId: "m-1",
          email: "staff@example.com",
          role: "staff",
          actedByAuthUserId: ACTOR,
        }),
      ).toThrow("while no active admin exists");
      expect(access.findByEmail("staff@example.com")).toBeNull();
      expect(access.pullEvents()).toHaveLength(0);
    });

    it("allows an admin first grant, then a staff grant", () => {
      const access = PropertyAccess.create({ propertyId: "property-1" });
      access.grantMembership({
        membershipId: "m-1",
        email: "admin@example.com",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });
      access.grantMembership({
        membershipId: "m-2",
        email: "staff@example.com",
        role: "staff",
        actedByAuthUserId: ACTOR,
      });

      expect(access.findByEmail("admin@example.com")?.status).toBe("active");
      expect(access.findByEmail("staff@example.com")?.role).toBe("staff");
    });

    it("grants are always unclaimed", () => {
      const access = PropertyAccess.create({ propertyId: "property-1" });
      access.grantMembership({
        membershipId: "m-1",
        email: "admin@example.com",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });

      expect(access.findByEmail("admin@example.com")?.authUserId).toBeNull();
      const granted = access.pullEvents()[0] as MembershipGranted;
      expect(granted.payload.authUserId).toBeNull();
    });

    it("rejects reactivating as staff when no admin is active", () => {
      const access = buildAccess([
        {
          id: "m-revoked",
          email: "former@example.com",
          role: "staff",
          status: "revoked",
          authUserId: null,
        },
      ]);
      expect(() =>
        access.reactivateMembership("m-revoked", "staff", ACTOR),
      ).toThrow("while no active admin exists");
      expect(access.findByEmail("former@example.com")?.status).toBe("revoked");
    });

    it("allows reactivating as admin when no admin is active", () => {
      const access = buildAccess([
        {
          id: "m-revoked",
          email: "former@example.com",
          role: "staff",
          status: "revoked",
          authUserId: null,
        },
      ]);
      access.reactivateMembership("m-revoked", "admin", ACTOR);

      expect(access.findByEmail("former@example.com")?.status).toBe("active");
      expect(access.findByEmail("former@example.com")?.role).toBe("admin");
    });
  });

  describe("claimMemberships", () => {
    it("binds unclaimed memberships to the auth user and returns ids", () => {
      const access = buildAccess([
        {
          id: "m-invite",
          email: "newbie@example.com",
          role: "staff",
          status: "active",
          authUserId: null,
        },
      ]);
      const claimed = access.claimMemberships(
        " Newbie@Example.com ",
        "auth-newbie",
      );

      expect(claimed).toEqual(["m-invite"]);
      expect(access.findByEmail("newbie@example.com")?.authUserId).toBe(
        "auth-newbie",
      );
    });

    it("skips already-claimed memberships without emitting", () => {
      const access = buildAccess([activeAdmin()]);
      expect(
        access.claimMemberships("admin@example.com", "auth-other"),
      ).toEqual([]);
      expect(access.pullEvents()).toHaveLength(0);
    });

    it("returns empty when no membership matches", () => {
      const access = buildAccess([activeAdmin()]);
      expect(
        access.claimMemberships("stranger@example.com", "auth-stranger"),
      ).toEqual([]);
    });
  });

  describe("version", () => {
    it("starts at 0 and bumps on every mutation", () => {
      const access = PropertyAccess.create({ propertyId: "property-1" });
      expect(access.version).toBe(0);
      access.grantMembership({
        membershipId: "m-1",
        email: "a@example.com",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });
      expect(access.version).toBe(1);
      access.grantMembership({
        membershipId: "m-2",
        email: "b@example.com",
        role: "admin",
        actedByAuthUserId: ACTOR,
      });
      access.revokeMembership("m-1", ACTOR);
      expect(access.version).toBe(3);
    });
  });
});
