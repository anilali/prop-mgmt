// Aggregates
export { Lease } from "./aggregates/lease";
export type {
  LeaseProps,
  LeaseStatus,
  LeaseDocument,
} from "./aggregates/lease";

// Events
export type {
  LeaseEvent,
  LeaseCreated,
  LeaseMetadataUpdated,
  LeaseActivated,
  LeaseEnded,
  LeaseDocumentAttached,
} from "./events/lease-events";

// Repository interfaces
export type { LeaseRepository } from "./repositories/lease-repository";

// Query interfaces
export type {
  LeaseView,
  LeaseListFilters,
  LeaseQueries,
} from "./queries/lease-queries";
