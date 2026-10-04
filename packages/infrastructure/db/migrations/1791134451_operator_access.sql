CREATE SCHEMA "access";
--> statement-breakpoint
CREATE TABLE "access"."access_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"auth_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_memberships_property_id_email_unique" UNIQUE("property_id","email")
);
--> statement-breakpoint
CREATE TABLE "access"."platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"auth_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email"),
	CONSTRAINT "platform_admins_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "access"."property_access" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "property"."staff_members" CASCADE;--> statement-breakpoint
ALTER TABLE "lease_mgmt"."leases" ADD COLUMN "property_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_mgmt"."tenants" ADD COLUMN "property_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "access"."access_memberships" ADD CONSTRAINT "access_memberships_property_id_property_access_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "access"."property_access"("property_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_memberships_auth_user_id_idx" ON "access"."access_memberships" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "access_memberships_email_idx" ON "access"."access_memberships" USING btree ("email");