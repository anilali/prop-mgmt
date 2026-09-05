// Aggregates
export { Property } from "./aggregates/property";
export type { PropertyProps } from "./aggregates/property";

export { Unit, validateUtilityAssignments } from "./aggregates/unit";
export type {
  UnitProps,
  UnitStatus,
  UtilityAssignment,
  UtilityType,
} from "./aggregates/unit";

export { StaffMember } from "./aggregates/staff-member";
export type { StaffMemberProps, StaffRole } from "./aggregates/staff-member";

// Events
export type {
  PropertyEvent,
  PropertyRegistered,
  PropertyMetadataUpdated,
} from "./events/property-events";

export type {
  UnitEvent,
  UnitCreated,
  UnitDetailsUpdated,
  UnitStatusChanged,
} from "./events/unit-events";

export type {
  StaffMemberEvent,
  StaffMemberProvisioned,
  RoleChanged,
  StaffMemberDeactivated,
} from "./events/staff-member-events";

// Repository interfaces
export type { PropertyRepository } from "./repositories/property-repository";
export type { UnitRepository } from "./repositories/unit-repository";
export type { StaffMemberRepository } from "./repositories/staff-member-repository";

// Query interfaces
export type {
  PropertyView,
  PropertyQueries,
} from "./queries/property-queries";
export type { UnitView, UnitQueries } from "./queries/unit-queries";
export type {
  StaffMemberView,
  StaffMemberQueries,
} from "./queries/staff-member-queries";

// Value objects
export type { Address } from "./value-objects/address";
