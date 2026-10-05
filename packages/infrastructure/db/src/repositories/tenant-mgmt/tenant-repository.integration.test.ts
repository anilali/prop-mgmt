import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { InMemoryEventDispatcher } from "@moonship/events";
import { Tenant } from "@moonship/tenant-mgmt";

import { createDb } from "../../client";
import { tenants } from "../../schemas/tenant-mgmt/schema";
import { PGTenantRepository } from "./tenant-repository";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("PGTenantRepository", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const dispatched: string[] = [];
  const events = new InMemoryEventDispatcher();
  events.subscribeAll((event) => {
    dispatched.push(event.eventType);
    return Promise.resolve();
  });
  const repo = new PGTenantRepository(db, events);
  const tenantIds: string[] = [];

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    }
    await db.$client.end({ timeout: 5 });
  });

  it("refuses to save a tenant over another property's tenant", async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    await repo.save(
      Tenant.create({ id: tenantId, propertyId: first, businessName: "Cafe" }),
    );
    dispatched.length = 0;

    const moved = Tenant.create({
      id: tenantId,
      propertyId: second,
      businessName: "Bakery",
    });
    await expect(repo.save(moved)).rejects.toThrow(
      "belongs to another property",
    );
    expect(dispatched).toEqual([]);
    expect((await repo.findById(first, tenantId))?.businessName).toBe("Cafe");
    expect(await repo.findById(second, tenantId)).toBeNull();
  });
});
