import { eq, inArray } from "drizzle-orm";

import type { PropertyQueries, PropertyView } from "@moonship/property";

import type { DbExecutor } from "../../client";
import { toPropertyProps } from "../../repositories/property/property-rows";
import { properties } from "../../schemas/property/schema";

export class PGPropertyQueries implements PropertyQueries {
  constructor(private db: DbExecutor) {}

  async getById(id: string): Promise<PropertyView | null> {
    const row = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return toPropertyProps(row);
  }

  async listByIds(ids: string[]): Promise<PropertyView[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(properties)
      .where(inArray(properties.id, ids));

    return rows.map(toPropertyProps);
  }

  async list(): Promise<PropertyView[]> {
    const rows = await this.db.select().from(properties);
    return rows.map(toPropertyProps);
  }
}
