import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { InMemoryEventDispatcher } from "@moonship/events";
import { Property } from "@moonship/property";

import { createDb } from "../../client";
import { PGPropertyQueries } from "../../queries/property/property-queries";
import { PGPropertyRepository } from "./property-repository";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("PGPropertyRepository", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const events = new InMemoryEventDispatcher();
  const repo = new PGPropertyRepository(db, events);
  const queries = new PGPropertyQueries(db);

  afterAll(async () => {
    await db.$client.end({ timeout: 5 });
  });

  it("saves and loads a property by id", async () => {
    const id = randomUUID();
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
});
