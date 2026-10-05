CREATE TABLE "billing"."recorded_pool_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"reconciliation_year_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"posted_on" date NOT NULL,
	"description" text NOT NULL,
	"source" varchar(8) NOT NULL,
	"cost_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recorded_pool_lines_source_check" CHECK ("billing"."recorded_pool_lines"."source" in ('bank', 'cash')),
	CONSTRAINT "recorded_pool_lines_description_check" CHECK (btrim("billing"."recorded_pool_lines"."description") <> ''),
	CONSTRAINT "recorded_pool_lines_cost_check" CHECK ("billing"."recorded_pool_lines"."cost_cents" <> 0)
);
--> statement-breakpoint
ALTER TABLE "billing"."reconciliation_years" ADD COLUMN "source" varchar(16) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."recorded_pool_lines" ADD CONSTRAINT "recorded_pool_lines_reconciliation_year_fk" FOREIGN KEY ("reconciliation_year_id") REFERENCES "billing"."reconciliation_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."recorded_pool_lines" ADD CONSTRAINT "recorded_pool_lines_pool_fk" FOREIGN KEY ("pool_id") REFERENCES "billing"."cost_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recorded_pool_lines_property_id_idx" ON "billing"."recorded_pool_lines" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "recorded_pool_lines_reconciliation_year_id_idx" ON "billing"."recorded_pool_lines" USING btree ("reconciliation_year_id");--> statement-breakpoint
ALTER TABLE "billing"."reconciliation_years" ADD CONSTRAINT "reconciliation_years_source_check" CHECK ("billing"."reconciliation_years"."source" in ('app', 'recorded'));--> statement-breakpoint
ALTER TABLE "billing"."reconciliation_years" ADD CONSTRAINT "reconciliation_years_recorded_check" CHECK ("billing"."reconciliation_years"."source" <> 'recorded' or "billing"."reconciliation_years"."status" = 'finalized');