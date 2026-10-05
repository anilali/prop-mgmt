DROP TABLE "lease_mgmt"."leases" CASCADE;--> statement-breakpoint
CREATE TABLE "lease_mgmt"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"opening_balance_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_mgmt"."lease_estimate_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lease_estimate_steps_lease_id_pool_id_starts_on_unique" UNIQUE("lease_id","pool_id","starts_on"),
	CONSTRAINT "lease_estimate_steps_amount_check" CHECK ("lease_mgmt"."lease_estimate_steps"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lease_mgmt"."lease_rent_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"tenant_notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lease_rent_steps_lease_id_starts_on_unique" UNIQUE("lease_id","starts_on"),
	CONSTRAINT "lease_rent_steps_amount_check" CHECK ("lease_mgmt"."lease_rent_steps"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lease_mgmt"."leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"move_out_date" date,
	"late_fee_cents" integer,
	"late_fee_day" smallint,
	"insurance_expires_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leases_late_fee_cents_check" CHECK ("lease_mgmt"."leases"."late_fee_cents" > 0),
	CONSTRAINT "leases_late_fee_day_check" CHECK ("lease_mgmt"."leases"."late_fee_day" between 1 and 28),
	CONSTRAINT "leases_late_fee_check" CHECK (("lease_mgmt"."leases"."late_fee_cents" is null) = ("lease_mgmt"."leases"."late_fee_day" is null))
);
--> statement-breakpoint
ALTER TABLE "lease_mgmt"."lease_estimate_steps" ADD CONSTRAINT "lease_estimate_steps_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "lease_mgmt"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_mgmt"."lease_rent_steps" ADD CONSTRAINT "lease_rent_steps_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "lease_mgmt"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_mgmt"."leases" ADD CONSTRAINT "leases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "lease_mgmt"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_property_id_unit_id_idx" ON "lease_mgmt"."accounts" USING btree ("property_id","unit_id");--> statement-breakpoint
CREATE INDEX "leases_account_id_idx" ON "lease_mgmt"."leases" USING btree ("account_id");