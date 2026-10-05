ALTER TABLE "property"."properties" ADD COLUMN "tracking_start_date" date;--> statement-breakpoint
ALTER TABLE "property"."properties" ADD COLUMN "time_zone" varchar(64) DEFAULT 'America/Chicago' NOT NULL;--> statement-breakpoint
ALTER TABLE "property"."properties" ADD COLUMN "owner_name" varchar(255);--> statement-breakpoint
ALTER TABLE "property"."properties" ADD COLUMN "owner_title" varchar(255);--> statement-breakpoint
ALTER TABLE "property"."properties" ADD COLUMN "company_name" varchar(255);--> statement-breakpoint
ALTER TABLE "property"."properties" ADD COLUMN "owner_phone" varchar(64);--> statement-breakpoint
ALTER TABLE "property"."properties" ADD COLUMN "owner_email" varchar(255);--> statement-breakpoint
ALTER TABLE "property"."units" ADD COLUMN "sqft_changed_on" date;--> statement-breakpoint
ALTER TABLE "property"."units" ADD COLUMN "address" json;--> statement-breakpoint
UPDATE "property"."units" AS "u"
SET "address" = CASE
  WHEN "u"."address_override" IS NULL OR json_typeof("u"."address_override") = 'null' THEN "p"."address"
  ELSE "u"."address_override"
END
FROM "property"."properties" AS "p"
WHERE "p"."id" = "u"."property_id";--> statement-breakpoint
ALTER TABLE "property"."units" ALTER COLUMN "address" SET NOT NULL;--> statement-breakpoint
DELETE FROM "property"."units" WHERE "sqft" <= 0;--> statement-breakpoint
UPDATE "property"."units" AS "u"
SET "label" = "u"."label" || ' ' || "d"."position"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "property_id", "label" ORDER BY "created_at", "id") AS "position"
  FROM "property"."units"
) AS "d"
WHERE "d"."id" = "u"."id" AND "d"."position" > 1;--> statement-breakpoint
ALTER TABLE "property"."units" ALTER COLUMN "sqft" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "property"."units" ADD CONSTRAINT "units_property_id_label_unique" UNIQUE("property_id","label");--> statement-breakpoint
ALTER TABLE "property"."units" ADD CONSTRAINT "units_sqft_positive" CHECK ("property"."units"."sqft" > 0);--> statement-breakpoint
ALTER TABLE "property"."units" DROP COLUMN "bedrooms";--> statement-breakpoint
ALTER TABLE "property"."units" DROP COLUMN "bathrooms";--> statement-breakpoint
ALTER TABLE "property"."units" DROP COLUMN "address_override";--> statement-breakpoint
ALTER TABLE "property"."units" DROP COLUMN "utilities";--> statement-breakpoint
ALTER TABLE "property"."units" DROP COLUMN "status";
