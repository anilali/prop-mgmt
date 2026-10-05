CREATE TABLE "billing"."account_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"entry_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text,
	"fee_month" char(7),
	"reconciliation_year_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_ledger_entries_kind_check" CHECK ("billing"."account_ledger_entries"."kind" in ('late_fee', 'late_fee_dismissed', 'adjustment', 'true_up')),
	CONSTRAINT "account_ledger_entries_late_fee_check" CHECK ("billing"."account_ledger_entries"."kind" <> 'late_fee' or ("billing"."account_ledger_entries"."amount_cents" > 0 and "billing"."account_ledger_entries"."fee_month" is not null)),
	CONSTRAINT "account_ledger_entries_late_fee_dismissed_check" CHECK ("billing"."account_ledger_entries"."kind" <> 'late_fee_dismissed' or ("billing"."account_ledger_entries"."amount_cents" = 0 and "billing"."account_ledger_entries"."fee_month" is not null)),
	CONSTRAINT "account_ledger_entries_adjustment_check" CHECK ("billing"."account_ledger_entries"."kind" <> 'adjustment' or ("billing"."account_ledger_entries"."amount_cents" <> 0 and btrim(coalesce("billing"."account_ledger_entries"."note", '')) <> '')),
	CONSTRAINT "account_ledger_entries_true_up_check" CHECK ("billing"."account_ledger_entries"."kind" <> 'true_up' or ("billing"."account_ledger_entries"."reconciliation_year_id" is not null and "billing"."account_ledger_entries"."amount_cents" <> 0)),
	CONSTRAINT "account_ledger_entries_fee_month_check" CHECK (("billing"."account_ledger_entries"."fee_month" is not null) = ("billing"."account_ledger_entries"."kind" in ('late_fee', 'late_fee_dismissed')) and ("billing"."account_ledger_entries"."fee_month" is null or "billing"."account_ledger_entries"."fee_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')),
	CONSTRAINT "account_ledger_entries_reconciliation_year_check" CHECK (("billing"."account_ledger_entries"."reconciliation_year_id" is not null) = ("billing"."account_ledger_entries"."kind" = 'true_up'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_ledger_entries_account_id_fee_month_unique" ON "billing"."account_ledger_entries" USING btree ("account_id","fee_month") WHERE "billing"."account_ledger_entries"."fee_month" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "account_ledger_entries_true_up_unique" ON "billing"."account_ledger_entries" USING btree ("reconciliation_year_id","account_id") WHERE "billing"."account_ledger_entries"."kind" = 'true_up';--> statement-breakpoint
CREATE INDEX "account_ledger_entries_property_id_idx" ON "billing"."account_ledger_entries" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "account_ledger_entries_account_id_idx" ON "billing"."account_ledger_entries" USING btree ("account_id");