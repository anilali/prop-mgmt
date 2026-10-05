CREATE TABLE "lease_mgmt"."lease_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"lease_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lease_documents_size_bytes_check" CHECK ("lease_mgmt"."lease_documents"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "lease_mgmt"."lease_documents" ADD CONSTRAINT "lease_documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "lease_mgmt"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_mgmt"."lease_documents" ADD CONSTRAINT "lease_documents_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "lease_mgmt"."leases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lease_documents_property_id_account_id_idx" ON "lease_mgmt"."lease_documents" USING btree ("property_id","account_id");--> statement-breakpoint
CREATE INDEX "lease_documents_lease_id_idx" ON "lease_mgmt"."lease_documents" USING btree ("lease_id");