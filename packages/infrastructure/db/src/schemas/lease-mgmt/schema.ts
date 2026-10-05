import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const leaseMgmtSchema = pgSchema("lease_mgmt");

export const accounts = leaseMgmtSchema.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("accounts_property_id_unit_id_idx").on(
      table.propertyId,
      table.unitId,
    ),
  ],
);

export const leases = leaseMgmtSchema.table(
  "leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    moveOutDate: date("move_out_date", { mode: "string" }),
    lateFeeCents: integer("late_fee_cents"),
    lateFeeDay: smallint("late_fee_day"),
    insuranceExpiresOn: date("insurance_expires_on", { mode: "string" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("leases_account_id_idx").on(table.accountId),
    check("leases_late_fee_cents_check", sql`${table.lateFeeCents} > 0`),
    check(
      "leases_late_fee_day_check",
      sql`${table.lateFeeDay} between 1 and 28`,
    ),
    check(
      "leases_late_fee_check",
      sql`(${table.lateFeeCents} is null) = (${table.lateFeeDay} is null)`,
    ),
  ],
);

export const leaseRentSteps = leaseMgmtSchema.table(
  "lease_rent_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    tenantNotifiedAt: timestamp("tenant_notified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("lease_rent_steps_lease_id_starts_on_unique").on(
      table.leaseId,
      table.startsOn,
    ),
    check("lease_rent_steps_amount_check", sql`${table.amountCents} >= 0`),
  ],
);

export const leaseEstimateSteps = leaseMgmtSchema.table(
  "lease_estimate_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    poolId: uuid("pool_id").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("lease_estimate_steps_lease_id_pool_id_starts_on_unique").on(
      table.leaseId,
      table.poolId,
      table.startsOn,
    ),
    check("lease_estimate_steps_amount_check", sql`${table.amountCents} >= 0`),
  ],
);

export const leaseDocuments = leaseMgmtSchema.table(
  "lease_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").references(() => leases.id, {
      onDelete: "set null",
    }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("lease_documents_property_id_account_id_idx").on(
      table.propertyId,
      table.accountId,
    ),
    index("lease_documents_lease_id_idx").on(table.leaseId),
    check("lease_documents_size_bytes_check", sql`${table.sizeBytes} > 0`),
  ],
);
