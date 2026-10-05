import { and, eq } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type { UnitRepository } from "@moonship/property";
import { Unit } from "@moonship/property";

import type { DbExecutor } from "../../client";
import { units } from "../../schemas/property/schema";

export class PGUnitRepository implements UnitRepository {
  constructor(
    private db: DbExecutor,
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
    return Unit.reconstitute({
      id: row.id,
      propertyId: row.propertyId,
      label: row.label,
      sqft: row.sqft,
      sqftChangedOn: row.sqftChangedOn,
      address: row.address,
    });
  }

  async save(unit: Unit): Promise<void> {
    const events = unit.pullEvents();
    const values = {
      label: unit.label,
      sqft: unit.sqft,
      sqftChangedOn: unit.sqftChangedOn,
      address: unit.address,
    };

    await this.db
      .insert(units)
      .values({ id: unit.id, propertyId: unit.propertyId, ...values })
      .onConflictDoUpdate({
        target: units.id,
        set: { ...values, updatedAt: new Date() },
        setWhere: eq(units.propertyId, unit.propertyId),
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
}
