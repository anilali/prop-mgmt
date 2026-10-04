import { eq } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type { PropertyRepository } from "@moonship/property";
import { Property } from "@moonship/property";

import type { DatabaseClient } from "../../client";
import { properties } from "../../schemas/property/schema";

export class PGPropertyRepository implements PropertyRepository {
  constructor(
    private db: DatabaseClient,
    private eventDispatcher?: EventDispatcher,
  ) {}

  async findById(id: string): Promise<Property | null> {
    const row = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return this.toAggregate(row);
  }

  async save(property: Property): Promise<void> {
    const events = property.pullEvents();

    await this.db
      .insert(properties)
      .values({
        id: property.id,
        name: property.name,
        address: property.address,
      })
      .onConflictDoUpdate({
        target: properties.id,
        set: {
          name: property.name,
          address: property.address,
          updatedAt: new Date(),
        },
      });

    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }

  private toAggregate(row: typeof properties.$inferSelect): Property {
    return Property.reconstitute({
      id: row.id,
      name: row.name,
      address: row.address,
    });
  }
}
