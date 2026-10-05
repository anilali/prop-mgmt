// Aggregates
export { Account, StaleAccountError } from "./aggregates/account";
export type {
  AccountProps,
  EstimateStep,
  LateFee,
  Lease,
  LeaseTermsInput,
  NewLease,
  RentStep,
} from "./aggregates/account";

// Events
export type {
  AccountEvent,
  AccountOpened,
  LeaseAdded,
  LeaseRemoved,
  LeaseUpdated,
} from "./events/account-events";

// Repository interfaces
export type { AccountRepository } from "./repositories/account-repository";

// Query interfaces
export type { AccountQueries, AccountView } from "./queries/account-queries";

// Documents
export type { LeaseDocument } from "./documents/lease-document";
export {
  LEASE_DOCUMENT_CONTENT_TYPE,
  LEASE_DOCUMENT_MAX_BYTES,
  leaseDocumentFileProblem,
  leaseDocumentStorageKey,
} from "./documents/lease-document";
export type { LeaseDocumentStore } from "./repositories/lease-document-store";
