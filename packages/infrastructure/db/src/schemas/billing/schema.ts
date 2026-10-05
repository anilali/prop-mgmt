import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgSchema,
  primaryKey,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const billingSchema = pgSchema("billing");

export const costPools = billingSchema.table(
  "cost_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    letterName: varchar("letter_name", { length: 64 }).notNull(),
    addsNewUnits: boolean("adds_new_units").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    membersChangedOn: date("members_changed_on", { mode: "string" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("cost_pools_property_id_name_unique").on(
      table.propertyId,
      table.name,
    ),
  ],
);

export const costPoolUnits = billingSchema.table(
  "cost_pool_units",
  {
    poolId: uuid("pool_id")
      .notNull()
      .references(() => costPools.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").notNull(),
    propertyId: uuid("property_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.poolId, table.unitId] })],
);

export const categories = billingSchema.table(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    poolId: uuid("pool_id")
      .unique()
      .references(() => costPools.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("categories_property_id_name_unique").on(
      table.propertyId,
      table.name,
    ),
    check(
      "categories_kind_check",
      sql`${table.kind} in ('shared_cost', 'owner_expense', 'income', 'not_counted')`,
    ),
    check(
      "categories_pool_id_check",
      sql`(${table.kind} = 'shared_cost') = (${table.poolId} is not null)`,
    ),
  ],
);
