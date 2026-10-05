ALTER TABLE "billing"."import_batches" ADD COLUMN "format" varchar(8) DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."import_batches" ADD COLUMN "account_last4" varchar(4);--> statement-breakpoint
ALTER TABLE "billing"."import_batches" ADD CONSTRAINT "import_batches_format_check" CHECK ("billing"."import_batches"."format" in ('csv', 'ofx'));