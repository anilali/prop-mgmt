// Aggregates
export { Tenant } from "./aggregates/tenant";
export type { TenantProps, TenantStatus } from "./aggregates/tenant";

// Events
export type {
  TenantEvent,
  TenantCreated,
  TenantUpdated,
  TenantArchived,
} from "./events/tenant-events";

// Repository interfaces
export type { TenantRepository } from "./repositories/tenant-repository";

// Query interfaces
export type { TenantView, TenantQueries } from "./queries/tenant-queries";
