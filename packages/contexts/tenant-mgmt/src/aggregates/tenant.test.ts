import { describe, expect, it } from "vitest";

import type {
  TenantArchived,
  TenantCreated,
  TenantUpdated,
} from "../events/tenant-events";
import type { TenantProps } from "./tenant";
import { Tenant } from "./tenant";

function buildTenantProps(overrides: Partial<TenantProps> = {}): TenantProps {
  return {
    id: "tenant-1",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    notes: "Prefers email",
    status: "active",
    ...overrides,
  };
}

describe("Tenant", () => {
  describe("create", () => {
    it("creates a tenant and emits TenantCreated", () => {
      const tenant = Tenant.create(buildTenantProps());

      expect(tenant.id).toBe("tenant-1");
      expect(tenant.fullName).toBe("Jane Doe");
      expect(tenant.email).toBe("jane@example.com");
      expect(tenant.phone).toBe("555-0100");
      expect(tenant.notes).toBe("Prefers email");
      expect(tenant.status).toBe("active");

      const events = tenant.pullEvents();
      expect(events).toHaveLength(1);
      const created = events[0] as TenantCreated;
      expect(created.eventType).toBe("TenantCreated");
      expect(created.payload).toEqual({ fullName: "Jane Doe" });
    });
  });

  describe("reconstitute", () => {
    it("restores a tenant without emitting events", () => {
      const tenant = Tenant.reconstitute(
        buildTenantProps({ id: "tenant-2", fullName: "John Smith" }),
      );

      expect(tenant.id).toBe("tenant-2");
      expect(tenant.fullName).toBe("John Smith");
      expect(tenant.pullEvents()).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates fields and emits TenantUpdated", () => {
      const tenant = Tenant.reconstitute(buildTenantProps());
      tenant.update({
        fullName: "Jane Smith",
        email: "jane.smith@example.com",
        phone: "555-0199",
        notes: "Updated notes",
      });

      expect(tenant.fullName).toBe("Jane Smith");
      expect(tenant.email).toBe("jane.smith@example.com");
      expect(tenant.phone).toBe("555-0199");
      expect(tenant.notes).toBe("Updated notes");

      const events = tenant.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as TenantUpdated).eventType).toBe("TenantUpdated");
    });

    it("clears optional fields when set to null", () => {
      const tenant = Tenant.reconstitute(buildTenantProps());
      tenant.update({ email: null, phone: null, notes: null });

      expect(tenant.email).toBeUndefined();
      expect(tenant.phone).toBeUndefined();
      expect(tenant.notes).toBeUndefined();
    });
  });

  describe("archive", () => {
    it("archives an active tenant and emits TenantArchived", () => {
      const tenant = Tenant.reconstitute(buildTenantProps());
      tenant.archive();

      expect(tenant.status).toBe("archived");
      const events = tenant.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as TenantArchived).eventType).toBe("TenantArchived");
    });

    it("does not emit when already archived", () => {
      const tenant = Tenant.reconstitute(
        buildTenantProps({ status: "archived" }),
      );
      tenant.archive();

      expect(tenant.status).toBe("archived");
      expect(tenant.pullEvents()).toHaveLength(0);
    });
  });
});
