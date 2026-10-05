CREATE TABLE "lease_mgmt"."lease_fixed_charge_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"starts_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lease_fixed_charge_steps_lease_id_name_starts_on_unique" UNIQUE("lease_id","name","starts_on"),
	CONSTRAINT "lease_fixed_charge_steps_amount_check" CHECK ("lease_mgmt"."lease_fixed_charge_steps"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lease_mgmt"."lease_fixed_charge_steps" ADD CONSTRAINT "lease_fixed_charge_steps_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "lease_mgmt"."leases"("id") ON DELETE cascade ON UPDATE no action;