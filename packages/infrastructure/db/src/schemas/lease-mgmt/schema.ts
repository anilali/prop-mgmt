import {
  date,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const leaseMgmtSchema = pgSchema("lease_mgmt");

export const leases = leaseMgmtSchema.table("leases", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }).notNull(),
  rentCents: integer("rent_cents").notNull(),
  depositCents: integer("deposit_cents"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  documentStorageKey: text("document_storage_key"),
  documentFileName: text("document_file_name"),
  documentContentType: text("document_content_type"),
  documentUploadedAt: timestamp("document_uploaded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
