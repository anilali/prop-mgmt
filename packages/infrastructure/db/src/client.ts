import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type DatabaseClient = PostgresJsDatabase & {
  $client: ReturnType<typeof postgres>;
};

export function createDb(connectionString: string): DatabaseClient {
  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client) as DatabaseClient;
  db.$client = client;
  return db;
}
