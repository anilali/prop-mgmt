import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const accessSchema = pgSchema("access");

export const platformAdmins = accessSchema.table("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  authUserId: text("auth_user_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const propertyAccess = accessSchema.table("property_access", {
  propertyId: uuid("property_id").primaryKey(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const accessMemberships = accessSchema.table(
  "access_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => propertyAccess.propertyId, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    authUserId: text("auth_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("access_memberships_property_id_email_unique").on(
      table.propertyId,
      table.email,
    ),
    index("access_memberships_auth_user_id_idx").on(table.authUserId),
    index("access_memberships_email_idx").on(table.email),
  ],
);
