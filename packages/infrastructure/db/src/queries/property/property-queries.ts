import { eq, inArray } from "drizzle-orm";

import type { PropertyQueries, PropertyView } from "@moonship/property";

import type { DatabaseClient } from "../../client";
import { properties } from "../../schemas/property/schema";

export class PGPropertyQueries implements PropertyQueries {
  constructor(private db: DatabaseClient) {}

  async getById(id: string): Promise<PropertyView | null> {
    const row = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      address: row.address,
    };
  }

  async listByIds(ids: string[]): Promise<PropertyView[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(properties)
      .where(inArray(properties.id, ids));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
    }));
  }

  async list(): Promise<PropertyView[]> {
    const rows = await this.db.select().from(properties);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
    }));
  }
}
