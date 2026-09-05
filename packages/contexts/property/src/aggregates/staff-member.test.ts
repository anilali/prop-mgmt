import { describe, expect, it } from "vitest";

import type {
  RoleChanged,
  StaffMemberDeactivated,
  StaffMemberProvisioned,
} from "../events/staff-member-events";
import type { StaffMemberProps } from "./staff-member";
import { StaffMember } from "./staff-member";

function buildStaffMemberProps(
  overrides: Partial<StaffMemberProps> = {},
): StaffMemberProps {
  return {
    id: "staff-1",
    authUserId: "auth-user-1",
    role: "staff",
    status: "active",
    ...overrides,
  };
}

describe("StaffMember", () => {
  describe("create", () => {
    it("provisions a staff member and emits StaffMemberProvisioned", () => {
      const member = StaffMember.create(buildStaffMemberProps());

      expect(member.id).toBe("staff-1");
      expect(member.authUserId).toBe("auth-user-1");
      expect(member.role).toBe("staff");
      expect(member.status).toBe("active");

      const events = member.pullEvents();
      expect(events).toHaveLength(1);
      const provisioned = events[0] as StaffMemberProvisioned;
      expect(provisioned.eventType).toBe("StaffMemberProvisioned");
      expect(provisioned.payload).toEqual({
        authUserId: "auth-user-1",
        role: "staff",
      });
    });
  });

  describe("reconstitute", () => {
    it("restores a staff member without emitting events", () => {
      const member = StaffMember.reconstitute(
        buildStaffMemberProps({ id: "staff-2" }),
      );

      expect(member.id).toBe("staff-2");
      expect(member.pullEvents()).toHaveLength(0);
    });
  });

  describe("changeRole", () => {
    it("changes the role and emits RoleChanged", () => {
      const member = StaffMember.reconstitute(buildStaffMemberProps());
      member.changeRole("admin");

      expect(member.role).toBe("admin");
      const events = member.pullEvents();
      expect(events).toHaveLength(1);
      const roleChanged = events[0] as RoleChanged;
      expect(roleChanged.eventType).toBe("RoleChanged");
      expect(roleChanged.payload).toEqual({ role: "admin" });
    });

    it("does not emit when role is unchanged", () => {
      const member = StaffMember.reconstitute(
        buildStaffMemberProps({ role: "staff" }),
      );
      member.changeRole("staff");

      expect(member.pullEvents()).toHaveLength(0);
    });
  });

  describe("deactivate", () => {
    it("sets status to deactivated and emits event", () => {
      const member = StaffMember.reconstitute(buildStaffMemberProps());
      member.deactivate();

      expect(member.status).toBe("deactivated");
      const events = member.pullEvents();
      expect(events).toHaveLength(1);
      const deactivated = events[0] as StaffMemberDeactivated;
      expect(deactivated.eventType).toBe("StaffMemberDeactivated");
      expect(deactivated.aggregateId).toBe("staff-1");
    });
  });
});
