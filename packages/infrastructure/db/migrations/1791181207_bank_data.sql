CREATE TABLE "billing"."bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(64) DEFAULT 'Business checking' NOT NULL,
	"csv_mapping" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"row_count" integer NOT NULL,
	"inserted_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"before_tracking_start_count" integer NOT NULL,
	"not_transaction_count" integer NOT NULL,
	"first_posted_on" date,
	"last_posted_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."transaction_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_allocations_amount_check" CHECK ("billing"."transaction_allocations"."amount_cents" <> 0),
	CONSTRAINT "transaction_allocations_target_check" CHECK (num_nonnulls("billing"."transaction_allocations"."account_id", "billing"."transaction_allocations"."category_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "billing"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"source" varchar(8) NOT NULL,
	"bank_account_id" uuid,
	"import_batch_id" uuid,
	"posted_on" date NOT NULL,
	"description" text NOT NULL,
	"description_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"external_id" text,
	"raw_row_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_source_check" CHECK ("billing"."transactions"."source" in ('bank', 'cash')),
	CONSTRAINT "transactions_amount_check" CHECK ("billing"."transactions"."amount_cents" <> 0),
	CONSTRAINT "transactions_bank_check" CHECK ("billing"."transactions"."source" <> 'bank' or ("billing"."transactions"."bank_account_id" is not null and "billing"."transactions"."import_batch_id" is not null and "billing"."transactions"."raw_row_hash" is not null)),
	CONSTRAINT "transactions_cash_check" CHECK ("billing"."transactions"."source" <> 'cash' or ("billing"."transactions"."bank_account_id" is null and "billing"."transactions"."import_batch_id" is null and "billing"."transactions"."raw_row_hash" is null and "billing"."transactions"."amount_cents" < 0))
);
--> statement-breakpoint
ALTER TABLE "billing"."import_batches" ADD CONSTRAINT "import_batches_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "billing"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."transaction_allocations" ADD CONSTRAINT "transaction_allocations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "billing"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."transaction_allocations" ADD CONSTRAINT "transaction_allocations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "billing"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "billing"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "billing"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_property_id_idx" ON "billing"."import_batches" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "import_batches_bank_account_id_idx" ON "billing"."import_batches" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "transaction_allocations_transaction_id_idx" ON "billing"."transaction_allocations" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_allocations_account_id_idx" ON "billing"."transaction_allocations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transaction_allocations_category_id_idx" ON "billing"."transaction_allocations" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_bank_account_id_external_id_unique" ON "billing"."transactions" USING btree ("bank_account_id","external_id") WHERE "billing"."transactions"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_dedupe_idx" ON "billing"."transactions" USING btree ("bank_account_id","posted_on","description_key","amount_cents");--> statement-breakpoint
CREATE INDEX "transactions_property_id_posted_on_idx" ON "billing"."transactions" USING btree ("property_id","posted_on");--> statement-breakpoint
CREATE INDEX "transactions_import_batch_id_idx" ON "billing"."transactions" USING btree ("import_batch_id");