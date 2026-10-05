CREATE TABLE "billing"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"pool_id" uuid,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_pool_id_unique" UNIQUE("pool_id"),
	CONSTRAINT "categories_property_id_name_unique" UNIQUE("property_id","name"),
	CONSTRAINT "categories_kind_check" CHECK ("billing"."categories"."kind" in ('shared_cost', 'owner_expense', 'income', 'not_counted')),
	CONSTRAINT "categories_pool_id_check" CHECK (("billing"."categories"."kind" = 'shared_cost') = ("billing"."categories"."pool_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "billing"."cost_pool_units" (
	"pool_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cost_pool_units_pool_id_unit_id_pk" PRIMARY KEY("pool_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."cost_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"letter_name" varchar(64) NOT NULL,
	"adds_new_units" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"members_changed_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cost_pools_property_id_name_unique" UNIQUE("property_id","name")
);
--> statement-breakpoint
ALTER TABLE "billing"."categories" ADD CONSTRAINT "categories_pool_id_cost_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "billing"."cost_pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."cost_pool_units" ADD CONSTRAINT "cost_pool_units_pool_id_cost_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "billing"."cost_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "billing"."cost_pools" ("property_id", "name", "letter_name", "adds_new_units", "sort_order")
SELECT "p"."id", "seed"."name", "seed"."letter_name", "seed"."adds_new_units", "seed"."sort_order"
FROM "property"."properties" AS "p"
CROSS JOIN (
  VALUES
    ('CAM', 'CAM', true, 0),
    ('Taxes', 'tax', true, 1),
    ('Insurance', 'insurance', true, 2),
    ('Water', 'water', false, 3)
) AS "seed" ("name", "letter_name", "adds_new_units", "sort_order");--> statement-breakpoint
INSERT INTO "billing"."cost_pool_units" ("pool_id", "unit_id", "property_id")
SELECT "cp"."id", "u"."id", "u"."property_id"
FROM "billing"."cost_pools" AS "cp"
JOIN "property"."units" AS "u" ON "u"."property_id" = "cp"."property_id"
WHERE "cp"."adds_new_units";--> statement-breakpoint
INSERT INTO "billing"."categories" ("property_id", "name", "kind", "pool_id")
SELECT "cp"."property_id", "cp"."name", 'shared_cost', "cp"."id"
FROM "billing"."cost_pools" AS "cp";--> statement-breakpoint
INSERT INTO "billing"."categories" ("property_id", "name", "kind")
SELECT "p"."id", "seed"."name", "seed"."kind"
FROM "property"."properties" AS "p"
CROSS JOIN (
  VALUES
    ('Repairs', 'owner_expense'),
    ('Owner utilities', 'owner_expense'),
    ('Other income', 'income'),
    ('Security deposit', 'not_counted'),
    ('Not property business', 'not_counted')
) AS "seed" ("name", "kind");
