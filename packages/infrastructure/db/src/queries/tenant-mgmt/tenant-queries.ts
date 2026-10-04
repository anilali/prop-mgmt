import { and, eq } from "drizzle-orm";

import type {
  TenantQueries,
  TenantStatus,
  TenantView,
} from "@moonship/tenant-mgmt";

import type { DatabaseClient } from "../../client";
import { tenants } from "../../schemas/tenant-mgmt/schema";

export class PGTenantQueries implements TenantQueries {
  constructor(private db: DatabaseClient) {}

  async list(propertyId: string): Promise<TenantView[]> {
    const rows = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.propertyId, propertyId));
    return rows.map((row) => this.toView(row));
  }

  async getById(propertyId: string, id: string): Promise<TenantView | null> {
    const row = await this.db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, id), eq(tenants.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    return this.toView(row);
  }

  private toView(row: typeof tenants.$inferSelect): TenantView {
    return {
      id: row.id,
      propertyId: row.propertyId,
      fullName: row.fullName,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      notes: row.notes ?? undefined,
      status: row.status as TenantStatus,
    };
  }
}
