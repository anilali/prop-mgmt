import { and, eq } from "drizzle-orm";

import type {
  LeaseListFilters,
  LeaseQueries,
  LeaseStatus,
  LeaseView,
} from "@moonship/lease-mgmt";

import type { DatabaseClient } from "../../client";
import { leases } from "../../schemas/lease-mgmt/schema";

export class PGLeaseQueries implements LeaseQueries {
  constructor(private db: DatabaseClient) {}

  async getById(propertyId: string, id: string): Promise<LeaseView | null> {
    const row = await this.db
      .select()
      .from(leases)
      .where(and(eq(leases.id, id), eq(leases.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return this.toView(row);
  }

  async list(
    propertyId: string,
    filters?: LeaseListFilters,
  ): Promise<LeaseView[]> {
    const conditions = [eq(leases.propertyId, propertyId)];
    if (filters?.unitId !== undefined) {
      conditions.push(eq(leases.unitId, filters.unitId));
    }
    if (filters?.status !== undefined) {
      conditions.push(eq(leases.status, filters.status));
    }

    const rows = await this.db
      .select()
      .from(leases)
      .where(and(...conditions));

    return rows.map((row) => this.toView(row));
  }

  async listActiveByUnitId(
    propertyId: string,
    unitId: string,
  ): Promise<LeaseView[]> {
    const rows = await this.db
      .select()
      .from(leases)
      .where(
        and(
          eq(leases.unitId, unitId),
          eq(leases.propertyId, propertyId),
          eq(leases.status, "active"),
        ),
      );

    return rows.map((row) => this.toView(row));
  }

  private toView(row: typeof leases.$inferSelect): LeaseView {
    return {
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
    };
  }
}
