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

// Repository interfaces
export type { PropertyRepository } from "./repositories/property-repository";
export type { UnitRepository } from "./repositories/unit-repository";

// Query interfaces
export type { PropertyView, PropertyQueries } from "./queries/property-queries";
export type { UnitView, UnitQueries } from "./queries/unit-queries";

// Value objects
export type { Address } from "./value-objects/address";
