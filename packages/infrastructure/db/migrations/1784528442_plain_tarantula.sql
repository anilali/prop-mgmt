CREATE TABLE "lease_mgmt"."leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"rent_cents" integer NOT NULL,
	"deposit_cents" integer,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"document_storage_key" text,
	"document_file_name" text,
	"document_content_type" text,
	"document_uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_mgmt"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(64),
	"notes" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property"."units" ADD COLUMN "sqft" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "property"."units" ADD COLUMN "address_override" json;--> statement-breakpoint
ALTER TABLE "property"."units" ADD COLUMN "utilities" json DEFAULT '[]'::json NOT NULL;