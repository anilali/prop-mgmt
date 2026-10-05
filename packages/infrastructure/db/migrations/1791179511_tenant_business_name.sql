ALTER TABLE "tenant_mgmt"."tenants" RENAME COLUMN "full_name" TO "business_name";--> statement-breakpoint
ALTER TABLE "tenant_mgmt"."tenants" ADD COLUMN "contact_name" varchar(255);--> statement-breakpoint
ALTER TABLE "tenant_mgmt"."tenants" ADD COLUMN "mailing_address" json;
