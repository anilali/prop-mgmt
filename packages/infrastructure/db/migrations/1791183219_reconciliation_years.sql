CREATE TABLE "billing"."pool_bill_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"reconciliation_year_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pool_bill_overrides_year_pool_unique" UNIQUE("reconciliation_year_id","pool_id"),
	CONSTRAINT "pool_bill_overrides_amount_check" CHECK ("billing"."pool_bill_overrides"."amount_cents" >= 0),
	CONSTRAINT "pool_bill_overrides_note_check" CHECK (btrim("billing"."pool_bill_overrides"."note") <> '')
);
--> statement-breakpoint
CREATE TABLE "billing"."reconciliation_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"letter_date" date,
	"finalized_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_years_property_id_year_unique" UNIQUE("property_id","year"),
	CONSTRAINT "reconciliation_years_status_check" CHECK ("billing"."reconciliation_years"."status" in ('draft', 'finalized')),
	CONSTRAINT "reconciliation_years_finalized_check" CHECK ("billing"."reconciliation_years"."status" <> 'finalized' or ("billing"."reconciliation_years"."finalized_at" is not null and "billing"."reconciliation_years"."letter_date" is not null))
);
--> statement-breakpoint
ALTER TABLE "billing"."pool_bill_overrides" ADD CONSTRAINT "pool_bill_overrides_reconciliation_year_fk" FOREIGN KEY ("reconciliation_year_id") REFERENCES "billing"."reconciliation_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."pool_bill_overrides" ADD CONSTRAINT "pool_bill_overrides_pool_fk" FOREIGN KEY ("pool_id") REFERENCES "billing"."cost_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_bill_overrides_property_id_idx" ON "billing"."pool_bill_overrides" USING btree ("property_id");--> statement-breakpoint
ALTER TABLE "billing"."account_ledger_entries" ADD CONSTRAINT "account_ledger_entries_reconciliation_year_fk" FOREIGN KEY ("reconciliation_year_id") REFERENCES "billing"."reconciliation_years"("id") ON DELETE no action ON UPDATE no action;