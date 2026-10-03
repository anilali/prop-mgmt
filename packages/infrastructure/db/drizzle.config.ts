import type { Config } from "drizzle-kit";

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL");
}

export default {
  schema: "./src/schemas/*/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  casing: "snake_case",
  out: "./migrations",
  migrations: {
    prefix: "unix",
  },
} satisfies Config;
