import {
  json,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { AddressJson } from "../property/schema";

export const tenantMgmtSchema = pgSchema("tenant_mgmt");

export const tenants = tenantMgmtSchema.table("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull(),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  mailingAddress: json("mailing_address").$type<AddressJson>(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  notes: text("notes"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
