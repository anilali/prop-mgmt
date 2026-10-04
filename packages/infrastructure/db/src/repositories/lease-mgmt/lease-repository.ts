import { and, eq } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type { LeaseRepository, LeaseStatus } from "@moonship/lease-mgmt";
import { Lease } from "@moonship/lease-mgmt";

import type { DatabaseClient } from "../../client";
import { leases } from "../../schemas/lease-mgmt/schema";

export class PGLeaseRepository implements LeaseRepository {
  constructor(
    private db: DatabaseClient,
    private eventDispatcher?: EventDispatcher,
  ) {}

  async findById(propertyId: string, id: string): Promise<Lease | null> {
    const row = await this.db
      .select()
      .from(leases)
      .where(and(eq(leases.id, id), eq(leases.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    return this.toAggregate(row);
  }

  async save(lease: Lease): Promise<void> {
    const events = lease.pullEvents();
    const doc = lease.document;
    await this.db
      .insert(leases)
      .values({
        id: lease.id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        startDate: lease.startDate,
        endDate: lease.endDate,
        rentCents: lease.rentCents,
        depositCents: lease.depositCents ?? null,
        status: lease.status,
        documentStorageKey: doc?.storageKey ?? null,
        documentFileName: doc?.fileName ?? null,
        documentContentType: doc?.contentType ?? null,
        documentUploadedAt: doc?.uploadedAt ?? null,
      })
      .onConflictDoUpdate({
        target: leases.id,
        set: {
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          tenantId: lease.tenantId,
          startDate: lease.startDate,
          endDate: lease.endDate,
          rentCents: lease.rentCents,
          depositCents: lease.depositCents ?? null,
          status: lease.status,
          documentStorageKey: doc?.storageKey ?? null,
          documentFileName: doc?.fileName ?? null,
          documentContentType: doc?.contentType ?? null,
          documentUploadedAt: doc?.uploadedAt ?? null,
          updatedAt: new Date(),
        },
      });
    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }

  private toAggregate(row: typeof leases.$inferSelect): Lease {
    return Lease.reconstitute({
      id: row.id,
      propertyId: row.propertyId,
      unitId: row.unitId,
      tenantId: row.tenantId,
      startDate: row.startDate,
      endDate: row.endDate,
      rentCents: row.rentCents,
      depositCents: row.depositCents ?? undefined,
      status: row.status as LeaseStatus,
      document:
        row.documentStorageKey &&
        row.documentFileName &&
        row.documentContentType &&
        row.documentUploadedAt
          ? {
              storageKey: row.documentStorageKey,
              fileName: row.documentFileName,
              contentType: row.documentContentType,
              uploadedAt: row.documentUploadedAt,
            }
          : null,
    });
  }
}
