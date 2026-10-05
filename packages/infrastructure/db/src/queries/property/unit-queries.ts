import { and, asc, eq } from "drizzle-orm";

import type { UnitQueries, UnitView } from "@moonship/property";

import type { DbExecutor } from "../../client";
import { units } from "../../schemas/property/schema";

export class PGUnitQueries implements UnitQueries {
  constructor(private db: DbExecutor) {}

  async list(propertyId: string): Promise<UnitView[]> {
    const rows = await this.db
      .select()
      .from(units)
      .where(eq(units.propertyId, propertyId))
      .orderBy(asc(units.label));
    return rows.map(toView);
  }

  async getById(propertyId: string, id: string): Promise<UnitView | null> {
    const row = await this.db
      .select()
      .from(units)
      .where(and(eq(units.id, id), eq(units.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return toView(row);
  }
}

function toView(row: typeof units.$inferSelect): UnitView {
  return {
    id: row.id,
    propertyId: row.propertyId,
    label: row.label,
    sqft: row.sqft,
    sqftChangedOn: row.sqftChangedOn,
    address: row.address,
  };
}
