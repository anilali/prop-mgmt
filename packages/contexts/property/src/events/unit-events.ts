import type { DomainEvent } from "@moonship/shared";

export interface UnitCreated extends DomainEvent {
  readonly eventType: "UnitCreated";
  readonly payload: {
    readonly propertyId: string;
    readonly label: string;
  };
}

export interface UnitDetailsUpdated extends DomainEvent {
  readonly eventType: "UnitDetailsUpdated";
}

export type UnitEvent = UnitCreated | UnitDetailsUpdated;
