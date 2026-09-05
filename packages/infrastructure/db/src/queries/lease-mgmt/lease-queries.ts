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

  async getById(id: string): Promise<LeaseView | null> {
    const row = await this.db
      .select()
      .from(leases)
      .where(eq(leases.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return this.toView(row);
  }

  async list(filters?: LeaseListFilters): Promise<LeaseView[]> {
    const conditions = [];
    if (filters?.unitId !== undefined) {
      conditions.push(eq(leases.unitId, filters.unitId));
    }
    if (filters?.status !== undefined) {
      conditions.push(eq(leases.status, filters.status));
    }

    const rows =
      conditions.length === 0
        ? await this.db.select().from(leases)
        : await this.db
            .select()
            .from(leases)
            .where(and(...conditions));

    return rows.map((row) => this.toView(row));
  }

  async listActiveByUnitId(unitId: string): Promise<LeaseView[]> {
    const rows = await this.db
      .select()
      .from(leases)
      .where(and(eq(leases.unitId, unitId), eq(leases.status, "active")));

    return rows.map((row) => this.toView(row));
  }

  private toView(row: typeof leases.$inferSelect): LeaseView {
    return {
      id: row.id,
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
