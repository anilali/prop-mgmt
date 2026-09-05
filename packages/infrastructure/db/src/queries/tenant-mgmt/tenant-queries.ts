import { eq } from "drizzle-orm";

import type {
  TenantQueries,
  TenantStatus,
  TenantView,
} from "@moonship/tenant-mgmt";

import type { DatabaseClient } from "../../client";
import { tenants } from "../../schemas/tenant-mgmt/schema";

export class PGTenantQueries implements TenantQueries {
  constructor(private db: DatabaseClient) {}

  async list(): Promise<TenantView[]> {
    const rows = await this.db.select().from(tenants);
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string): Promise<TenantView | null> {
    const row = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    return this.toView(row);
  }

  private toView(row: typeof tenants.$inferSelect): TenantView {
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      notes: row.notes ?? undefined,
      status: row.status as TenantStatus,
    };
  }
}
