import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  json,
  pgSchema,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const propertySchema = pgSchema("property");

export interface AddressJson {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export const properties = propertySchema.table("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  address: json("address").$type<AddressJson>().notNull(),
  trackingStartDate: date("tracking_start_date", { mode: "string" }),
  timeZone: varchar("time_zone", { length: 64 })
    .notNull()
    .default("America/Chicago"),
  ownerName: varchar("owner_name", { length: 255 }),
  ownerTitle: varchar("owner_title", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  ownerPhone: varchar("owner_phone", { length: 64 }),
  ownerEmail: varchar("owner_email", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const units = propertySchema.table(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 64 }).notNull(),
    sqft: integer("sqft").notNull(),
    sqftChangedOn: date("sqft_changed_on", { mode: "string" }),
    address: json("address").$type<AddressJson>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("units_property_id_label_unique").on(table.propertyId, table.label),
    check("units_sqft_positive", sql`${table.sqft} > 0`),
  ],
);

export const propertiesRelations = relations(properties, ({ many }) => ({
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
}));
