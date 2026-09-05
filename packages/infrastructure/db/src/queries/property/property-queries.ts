import type { PropertyQueries, PropertyView } from "@moonship/property";

import type { DatabaseClient } from "../../client";
import { properties } from "../../schemas/property/schema";

export class PGPropertyQueries implements PropertyQueries {
  constructor(private db: DatabaseClient) {}

  async get(): Promise<PropertyView | null> {
    const row = await this.db
      .select()
      .from(properties)
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      address: row.address,
    };
  }
}
