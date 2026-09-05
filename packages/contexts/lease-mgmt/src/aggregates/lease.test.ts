import { describe, expect, it } from "vitest";

import type {
  LeaseActivated,
  LeaseCreated,
  LeaseDocumentAttached,
  LeaseEnded,
  LeaseMetadataUpdated,
} from "../events/lease-events";
import type { LeaseDocument, LeaseProps } from "./lease";
import { Lease } from "./lease";

function buildLeaseProps(
  overrides: Partial<LeaseProps> = {},
): LeaseProps {
  return {
    id: "lease-1",
    unitId: "unit-1",
    tenantId: "tenant-1",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-12-31"),
    rentCents: 150_000,
    depositCents: 150_000,
    status: "draft",
    document: null,
    ...overrides,
  };
}

describe("Lease", () => {
  describe("create", () => {
    it("creates a draft lease by default and emits LeaseCreated", () => {
      const { status: _status, document: _document, ...createProps } =
        buildLeaseProps();
      const lease = Lease.create(createProps);

      expect(lease.id).toBe("lease-1");
      expect(lease.unitId).toBe("unit-1");
      expect(lease.tenantId).toBe("tenant-1");
      expect(lease.rentCents).toBe(150_000);
      expect(lease.depositCents).toBe(150_000);
      expect(lease.status).toBe("draft");
      expect(lease.document).toBeNull();

      const events = lease.pullEvents();
      expect(events).toHaveLength(1);
      const created = events[0] as LeaseCreated;
      expect(created.eventType).toBe("LeaseCreated");
      expect(created.payload).toEqual({
        unitId: "unit-1",
        tenantId: "tenant-1",
        status: "draft",
      });
    });

    it("creates an active lease when status is provided", () => {
      const { status: _status, document: _document, ...createProps } =
        buildLeaseProps();
      const lease = Lease.create({ ...createProps, status: "active" });

      expect(lease.status).toBe("active");
      const created = lease.pullEvents()[0] as LeaseCreated;
      expect(created.payload.status).toBe("active");
    });

    it("rejects endDate before startDate", () => {
      const { status: _status, document: _document, ...createProps } =
        buildLeaseProps({
          startDate: new Date("2026-06-01"),
          endDate: new Date("2026-01-01"),
        });
      expect(() => Lease.create(createProps)).toThrow(
        "endDate must be on or after startDate",
      );
    });

    it("rejects negative rentCents", () => {
      const { status: _status, document: _document, ...createProps } =
        buildLeaseProps({ rentCents: -1 });
      expect(() => Lease.create(createProps)).toThrow("rentCents must be >= 0");
    });
  });

  describe("reconstitute", () => {
    it("restores a lease without emitting events", () => {
      const lease = Lease.reconstitute(
        buildLeaseProps({ id: "lease-2", status: "active" }),
      );

      expect(lease.id).toBe("lease-2");
      expect(lease.status).toBe("active");
      expect(lease.pullEvents()).toHaveLength(0);
    });
  });

  describe("updateMetadata", () => {
    it("updates dates, rent, and deposit", () => {
      const lease = Lease.reconstitute(buildLeaseProps());
      lease.updateMetadata({
        startDate: new Date("2026-02-01"),
        endDate: new Date("2027-01-31"),
        rentCents: 160_000,
        depositCents: 160_000,
      });

      expect(lease.startDate).toEqual(new Date("2026-02-01"));
      expect(lease.endDate).toEqual(new Date("2027-01-31"));
      expect(lease.rentCents).toBe(160_000);
      expect(lease.depositCents).toBe(160_000);

      const events = lease.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as LeaseMetadataUpdated).eventType).toBe(
        "LeaseMetadataUpdated",
      );
    });

    it("clears deposit when set to null", () => {
      const lease = Lease.reconstitute(buildLeaseProps());
      lease.updateMetadata({ depositCents: null });

      expect(lease.depositCents).toBeUndefined();
    });

    it("rejects updates when ended", () => {
      const lease = Lease.reconstitute(buildLeaseProps({ status: "ended" }));
      expect(() => lease.updateMetadata({ rentCents: 100 })).toThrow(
        "Cannot update metadata on an ended lease",
      );
    });
  });

  describe("activate", () => {
    it("activates a draft lease and emits LeaseActivated", () => {
      const lease = Lease.reconstitute(buildLeaseProps({ status: "draft" }));
      lease.activate();

      expect(lease.status).toBe("active");
      const events = lease.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as LeaseActivated).eventType).toBe("LeaseActivated");
    });

    it("does not emit when already active", () => {
      const lease = Lease.reconstitute(buildLeaseProps({ status: "active" }));
      lease.activate();

      expect(lease.pullEvents()).toHaveLength(0);
    });

    it("rejects activating an ended lease", () => {
      const lease = Lease.reconstitute(buildLeaseProps({ status: "ended" }));
      expect(() => lease.activate()).toThrow("Cannot activate an ended lease");
    });
  });

  describe("end", () => {
    it("ends a lease and emits LeaseEnded", () => {
      const lease = Lease.reconstitute(buildLeaseProps({ status: "active" }));
      lease.end();

      expect(lease.status).toBe("ended");
      const events = lease.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as LeaseEnded).eventType).toBe("LeaseEnded");
    });

    it("does not emit when already ended", () => {
      const lease = Lease.reconstitute(buildLeaseProps({ status: "ended" }));
      lease.end();

      expect(lease.pullEvents()).toHaveLength(0);
    });
  });

  describe("attachDocument", () => {
    it("attaches document metadata and emits LeaseDocumentAttached", () => {
      const lease = Lease.reconstitute(buildLeaseProps());
      const doc: LeaseDocument = {
        storageKey: "leases/lease-1/agreement.pdf",
        fileName: "agreement.pdf",
        contentType: "application/pdf",
        uploadedAt: new Date("2026-01-15"),
      };
      lease.attachDocument(doc);

      expect(lease.document).toEqual(doc);
      const events = lease.pullEvents();
      expect(events).toHaveLength(1);
      const attached = events[0] as LeaseDocumentAttached;
      expect(attached.eventType).toBe("LeaseDocumentAttached");
      expect(attached.payload).toEqual({
        storageKey: doc.storageKey,
        fileName: doc.fileName,
      });
    });

    it("replaces previous document metadata", () => {
      const lease = Lease.reconstitute(
        buildLeaseProps({
          document: {
            storageKey: "old-key",
            fileName: "old.pdf",
            contentType: "application/pdf",
            uploadedAt: new Date("2026-01-01"),
          },
        }),
      );
      const next: LeaseDocument = {
        storageKey: "new-key",
        fileName: "new.pdf",
        contentType: "application/pdf",
        uploadedAt: new Date("2026-02-01"),
      };
      lease.attachDocument(next);

      expect(lease.document).toEqual(next);
    });
  });
});
