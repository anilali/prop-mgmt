CREATE TABLE "billing"."reconciliation_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"reconciliation_year_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"true_up_cents" integer NOT NULL,
	"balance_on_account_cents" integer NOT NULL,
	"pdf_storage_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_statements_year_account_unique" UNIQUE("reconciliation_year_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "billing"."reconciliation_statements" ADD CONSTRAINT "reconciliation_statements_reconciliation_year_fk" FOREIGN KEY ("reconciliation_year_id") REFERENCES "billing"."reconciliation_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_statements_property_id_idx" ON "billing"."reconciliation_statements" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "reconciliation_statements_account_id_idx" ON "billing"."reconciliation_statements" USING btree ("account_id");