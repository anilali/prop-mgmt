import { eq } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type { PropertyRepository } from "@moonship/property";
import { Property } from "@moonship/property";

import type { DbExecutor } from "../../client";
import { properties } from "../../schemas/property/schema";
import { toPropertyProps } from "./property-rows";

export class PGPropertyRepository implements PropertyRepository {
  constructor(
    private db: DbExecutor,
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
    return Property.reconstitute(toPropertyProps(row));
  }

  async save(property: Property): Promise<void> {
    const events = property.pullEvents();
    const values = {
      name: property.name,
      address: property.address,
      trackingStartDate: property.trackingStartDate,
      timeZone: property.timeZone,
      ownerName: property.letter.ownerName,
      ownerTitle: property.letter.ownerTitle,
      companyName: property.letter.companyName,
      ownerPhone: property.letter.ownerPhone,
      ownerEmail: property.letter.ownerEmail,
    };

    await this.db
      .insert(properties)
      .values({ id: property.id, ...values })
      .onConflictDoUpdate({
        target: properties.id,
        set: { ...values, updatedAt: new Date() },
      });

    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }
}
