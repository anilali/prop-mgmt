import { and, eq } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type { TenantRepository, TenantStatus } from "@moonship/tenant-mgmt";
import { Tenant } from "@moonship/tenant-mgmt";

import type { DbExecutor } from "../../client";
import { tenants } from "../../schemas/tenant-mgmt/schema";

export class PGTenantRepository implements TenantRepository {
  constructor(
    private db: DbExecutor,
    private eventDispatcher?: EventDispatcher,
  ) {}

  async findById(propertyId: string, id: string): Promise<Tenant | null> {
    const row = await this.db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, id), eq(tenants.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    return Tenant.reconstitute({
      id: row.id,
      propertyId: row.propertyId,
      businessName: row.businessName,
      contactName: row.contactName ?? undefined,
      mailingAddress: row.mailingAddress ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      notes: row.notes ?? undefined,
      status: row.status as TenantStatus,
    });
  }

  async save(tenant: Tenant): Promise<void> {
    const events = tenant.pullEvents();
    const values = {
      businessName: tenant.businessName,
      contactName: tenant.contactName ?? null,
      mailingAddress: tenant.mailingAddress ?? null,
      email: tenant.email ?? null,
      phone: tenant.phone ?? null,
      notes: tenant.notes ?? null,
      status: tenant.status,
    };
    const saved = await this.db
      .insert(tenants)
      .values({ id: tenant.id, propertyId: tenant.propertyId, ...values })
      .onConflictDoUpdate({
        target: tenants.id,
        set: { ...values, updatedAt: new Date() },
        setWhere: eq(tenants.propertyId, tenant.propertyId),
      })
      .returning({ id: tenants.id });
    if (saved.length === 0) {
      throw new Error(`Tenant ${tenant.id} belongs to another property`);
    }
    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }
}
