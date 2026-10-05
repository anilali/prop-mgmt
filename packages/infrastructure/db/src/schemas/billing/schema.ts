import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { CsvMapping } from "@moonship/billing";

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

export const bankAccounts = billingSchema.table(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    name: varchar("name", { length: 64 })
      .notNull()
      .default("Business checking"),
    csvMapping: jsonb("csv_mapping").$type<CsvMapping>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("bank_accounts_property_id_unique").on(table.propertyId)],
);

export const importBatches = billingSchema.table(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    fileName: text("file_name").notNull(),
    importedAt: timestamp("imported_at").notNull().defaultNow(),
    rowCount: integer("row_count").notNull(),
    insertedCount: integer("inserted_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull(),
    beforeTrackingStartCount: integer("before_tracking_start_count").notNull(),
    notTransactionCount: integer("not_transaction_count").notNull(),
    firstPostedOn: date("first_posted_on", { mode: "string" }),
    lastPostedOn: date("last_posted_on", { mode: "string" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("import_batches_property_id_idx").on(table.propertyId),
    index("import_batches_bank_account_id_idx").on(table.bankAccountId),
  ],
);

export const transactions = billingSchema.table(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    source: varchar("source", { length: 8 }).notNull(),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    postedOn: date("posted_on", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    descriptionKey: text("description_key").notNull(),
    amountCents: integer("amount_cents").notNull(),
    externalId: text("external_id"),
    rawRowHash: text("raw_row_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "transactions_source_check",
      sql`${table.source} in ('bank', 'cash')`,
    ),
    check("transactions_amount_check", sql`${table.amountCents} <> 0`),
    check(
      "transactions_bank_check",
      sql`${table.source} <> 'bank' or (${table.bankAccountId} is not null and ${table.importBatchId} is not null and ${table.rawRowHash} is not null)`,
    ),
    check(
      "transactions_cash_check",
      sql`${table.source} <> 'cash' or (${table.bankAccountId} is null and ${table.importBatchId} is null and ${table.rawRowHash} is null and ${table.amountCents} < 0)`,
    ),
    uniqueIndex("transactions_bank_account_id_external_id_unique")
      .on(table.bankAccountId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    index("transactions_dedupe_idx").on(
      table.bankAccountId,
      table.postedOn,
      table.descriptionKey,
      table.amountCents,
    ),
    index("transactions_property_id_posted_on_idx").on(
      table.propertyId,
      table.postedOn,
    ),
    index("transactions_import_batch_id_idx").on(table.importBatchId),
  ],
);

export const transactionAllocations = billingSchema.table(
  "transaction_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "transaction_allocations_amount_check",
      sql`${table.amountCents} <> 0`,
    ),
    check(
      "transaction_allocations_target_check",
      sql`num_nonnulls(${table.accountId}, ${table.categoryId}) = 1`,
    ),
    index("transaction_allocations_transaction_id_idx").on(table.transactionId),
    index("transaction_allocations_account_id_idx").on(table.accountId),
    index("transaction_allocations_category_id_idx").on(table.categoryId),
  ],
);

export const accountLedgerEntries = billingSchema.table(
  "account_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull(),
    accountId: uuid("account_id").notNull(),
    kind: varchar("kind", { length: 24 }).notNull(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    feeMonth: char("fee_month", { length: 7 }),
    reconciliationYearId: uuid("reconciliation_year_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "account_ledger_entries_kind_check",
      sql`${table.kind} in ('late_fee', 'late_fee_dismissed', 'adjustment', 'true_up')`,
    ),
    check(
      "account_ledger_entries_late_fee_check",
      sql`${table.kind} <> 'late_fee' or (${table.amountCents} > 0 and ${table.feeMonth} is not null)`,
    ),
    check(
      "account_ledger_entries_late_fee_dismissed_check",
      sql`${table.kind} <> 'late_fee_dismissed' or (${table.amountCents} = 0 and ${table.feeMonth} is not null)`,
    ),
    check(
      "account_ledger_entries_adjustment_check",
      sql`${table.kind} <> 'adjustment' or (${table.amountCents} <> 0 and btrim(coalesce(${table.note}, '')) <> '')`,
    ),
    check(
      "account_ledger_entries_true_up_check",
      sql`${table.kind} <> 'true_up' or (${table.reconciliationYearId} is not null and ${table.amountCents} <> 0)`,
    ),
    check(
      "account_ledger_entries_fee_month_check",
      sql`(${table.feeMonth} is not null) = (${table.kind} in ('late_fee', 'late_fee_dismissed')) and (${table.feeMonth} is null or ${table.feeMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')`,
    ),
    check(
      "account_ledger_entries_reconciliation_year_check",
      sql`(${table.reconciliationYearId} is not null) = (${table.kind} = 'true_up')`,
    ),
    uniqueIndex("account_ledger_entries_account_id_fee_month_unique")
      .on(table.accountId, table.feeMonth)
      .where(sql`${table.feeMonth} is not null`),
    uniqueIndex("account_ledger_entries_true_up_unique")
      .on(table.reconciliationYearId, table.accountId)
      .where(sql`${table.kind} = 'true_up'`),
    index("account_ledger_entries_property_id_idx").on(table.propertyId),
    index("account_ledger_entries_account_id_idx").on(table.accountId),
  ],
);
