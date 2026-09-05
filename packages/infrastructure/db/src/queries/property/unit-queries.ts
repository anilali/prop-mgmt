import { eq } from "drizzle-orm";

import type {
  UnitQueries,
  UnitStatus,
  UnitView,
  UtilityAssignment,
} from "@moonship/property";

import type { DatabaseClient } from "../../client";
import { units } from "../../schemas/property/schema";

export class PGUnitQueries implements UnitQueries {
  constructor(private db: DatabaseClient) {}

  async list(): Promise<UnitView[]> {
    const rows = await this.db.select().from(units);
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string): Promise<UnitView | null> {
    const row = await this.db
      .select()
      .from(units)
      .where(eq(units.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return this.toView(row);
  }

  private toView(row: typeof units.$inferSelect): UnitView {
    return {
      id: row.id,
      propertyId: row.propertyId,
      label: row.label,
      sqft: row.sqft,
      bedrooms: row.bedrooms ?? undefined,
      bathrooms: row.bathrooms ?? undefined,
      addressOverride: row.addressOverride ?? null,
      utilities: (row.utilities ?? []) as UtilityAssignment[],
      status: row.status as UnitStatus,
    };
  }
}
