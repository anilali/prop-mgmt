-- Custom SQL migration file, put your code below! --
DELETE FROM "lease_mgmt"."leases";--> statement-breakpoint
DELETE FROM "tenant_mgmt"."tenants";
