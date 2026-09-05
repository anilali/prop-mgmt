import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { Property } from "@moonship/property";
import { InMemoryEventDispatcher } from "@moonship/events";

import { createDb } from "../../client";
import { PGPropertyRepository } from "./property-repository";
import { PGPropertyQueries } from "../../queries/property/property-queries";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("PGPropertyRepository", () => {
  const db = createDb(databaseUrl!);
  const events = new InMemoryEventDispatcher();
  const repo = new PGPropertyRepository(db, events);
  const queries = new PGPropertyQueries(db);

  afterAll(async () => {
    await db.$client.end({ timeout: 5 });
  });

  it("saves and loads the singleton property", async () => {
    const existing = await repo.findSingleton();
    if (existing) {
      const view = await queries.get();
      expect(view?.id).toBe(existing.id);
      return;
    }

    const property = Property.create({
      id: randomUUID(),
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

    const loaded = await repo.findSingleton();
    expect(loaded?.name).toBe("Integration Test Property");
    expect(loaded?.address.city).toBe("Testville");
  });
});
