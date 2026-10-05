import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { InMemoryEventDispatcher } from "@moonship/events";
import { Property, Unit } from "@moonship/property";

import { createDb } from "../../client";
import { PGPropertyQueries } from "../../queries/property/property-queries";
import { properties } from "../../schemas/property/schema";
import { PGPropertyRepository } from "./property-repository";
import { PGUnitRepository } from "./unit-repository";

const address = {
  street1: "1 Test St",
  city: "Testville",
  state: "CA",
  postalCode: "90000",
  country: "US",
};

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("PGPropertyRepository", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const events = new InMemoryEventDispatcher();
  const repo = new PGPropertyRepository(db, events);
  const queries = new PGPropertyQueries(db);

  const propertyIds: string[] = [];

  afterAll(async () => {
    if (propertyIds.length > 0) {
      await db.delete(properties).where(inArray(properties.id, propertyIds));
    }
    await db.$client.end({ timeout: 5 });
  });

  it("saves and loads a property by id", async () => {
    const id = randomUUID();
    propertyIds.push(id);
    const property = Property.create({
      id,
      name: "Integration Test Property",
      address: {
        street1: "1 Test St",
        city: "Testville",
        state: "CA",
        postalCode: "90000",
        country: "US",
      },
    });

    await repo.save(property);

    const loaded = await repo.findById(id);
    expect(loaded?.name).toBe("Integration Test Property");
    expect(loaded?.address.city).toBe("Testville");

    const view = await queries.getById(id);
    expect(view?.id).toBe(id);
  });

  it("refuses to save a unit over another property's unit", async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    propertyIds.push(first, second);
    for (const id of [first, second]) {
      await repo.save(
        Property.create({ id, name: "Unit Test Property", address }),
      );
    }
    const dispatched: string[] = [];
    const unitEvents = new InMemoryEventDispatcher();
    unitEvents.subscribeAll((event) => {
      dispatched.push(event.eventType);
      return Promise.resolve();
    });
    const units = new PGUnitRepository(db, unitEvents);
    const unitId = randomUUID();
    await units.save(
      Unit.create({
        id: unitId,
        propertyId: first,
        label: "A",
        sqft: 1_000,
        address,
      }),
    );
    dispatched.length = 0;

    const moved = Unit.create({
      id: unitId,
      propertyId: second,
      label: "B",
      sqft: 2_000,
      address,
    });
    await expect(units.save(moved)).rejects.toThrow(
      "belongs to another property",
    );
    expect(dispatched).toEqual([]);
    expect((await units.findById(first, unitId))?.label).toBe("A");
    expect(await units.findById(second, unitId)).toBeNull();
  });
});
