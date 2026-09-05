import type { DomainEvent } from "@moonship/shared";

import type { UnitStatus } from "../aggregates/unit";

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

export interface UnitStatusChanged extends DomainEvent {
  readonly eventType: "UnitStatusChanged";
  readonly payload: {
    readonly status: UnitStatus;
  };
}

export type UnitEvent = UnitCreated | UnitDetailsUpdated | UnitStatusChanged;
