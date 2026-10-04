import { relations } from "drizzle-orm";
import {
  integer,
  json,
  pgSchema,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const propertySchema = pgSchema("property");

export type AddressJson = {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type UtilityTypeJson = "electric" | "gas" | "water" | "sewer" | "trash";

export type UtilityAssignmentJson =
  | { type: UtilityTypeJson; kind: "individual" }
  | { type: UtilityTypeJson; kind: "shares"; withUnitId: string };

export const properties = propertySchema.table("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  address: json("address").$type<AddressJson>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const units = propertySchema.table("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 64 }).notNull(),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  sqft: integer("sqft").notNull().default(0),
  addressOverride: json("address_override").$type<AddressJson | null>(),
  utilities: json("utilities")
    .$type<UtilityAssignmentJson[]>()
    .notNull()
    .default([]),
  status: varchar("status", { length: 32 }).notNull().default("vacant"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const propertiesRelations = relations(properties, ({ many }) => ({
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
}));
