import { and, eq } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type {
  UnitRepository,
  UnitStatus,
  UtilityAssignment,
} from "@moonship/property";
import { Unit } from "@moonship/property";

import type { DatabaseClient } from "../../client";
import { units } from "../../schemas/property/schema";

export class PGUnitRepository implements UnitRepository {
  constructor(
    private db: DatabaseClient,
    private eventDispatcher?: EventDispatcher,
  ) {}

  async findById(propertyId: string, id: string): Promise<Unit | null> {
    const row = await this.db
      .select()
      .from(units)
      .where(and(eq(units.id, id), eq(units.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return this.toAggregate(row);
  }

  async save(unit: Unit): Promise<void> {
    const events = unit.pullEvents();

    await this.db
      .insert(units)
      .values({
        id: unit.id,
        propertyId: unit.propertyId,
        label: unit.label,
        bedrooms: unit.bedrooms ?? null,
        bathrooms: unit.bathrooms ?? null,
        sqft: unit.sqft,
        addressOverride: unit.addressOverride,
        utilities: unit.utilities,
        status: unit.status,
      })
      .onConflictDoUpdate({
        target: units.id,
        set: {
          label: unit.label,
          bedrooms: unit.bedrooms ?? null,
          bathrooms: unit.bathrooms ?? null,
          sqft: unit.sqft,
          addressOverride: unit.addressOverride,
          utilities: unit.utilities,
          status: unit.status,
          updatedAt: new Date(),
        },
      });

    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }

  async delete(propertyId: string, id: string): Promise<void> {
    await this.db
      .delete(units)
      .where(and(eq(units.propertyId, propertyId), eq(units.id, id)));
  }

  private toAggregate(row: typeof units.$inferSelect): Unit {
    return Unit.reconstitute({
      id: row.id,
      propertyId: row.propertyId,
      label: row.label,
      bedrooms: row.bedrooms ?? undefined,
      bathrooms: row.bathrooms ?? undefined,
      sqft: row.sqft,
      addressOverride: row.addressOverride ?? null,
      utilities: row.utilities as UtilityAssignment[],
      status: row.status as UnitStatus,
    });
  }
}
