import type { DomainEvent } from "@moonship/shared";

import type { LeaseStatus } from "../aggregates/lease";

export interface LeaseCreated extends DomainEvent {
  readonly eventType: "LeaseCreated";
  readonly payload: {
    readonly propertyId: string;
    readonly unitId: string;
    readonly tenantId: string;
    readonly status: LeaseStatus;
  };
}

export interface LeaseMetadataUpdated extends DomainEvent {
  readonly eventType: "LeaseMetadataUpdated";
}

export interface LeaseActivated extends DomainEvent {
  readonly eventType: "LeaseActivated";
}

export interface LeaseEnded extends DomainEvent {
  readonly eventType: "LeaseEnded";
}

export interface LeaseDocumentAttached extends DomainEvent {
  readonly eventType: "LeaseDocumentAttached";
  readonly payload: {
    readonly storageKey: string;
    readonly fileName: string;
  };
}

export type LeaseEvent =
  | LeaseCreated
  | LeaseMetadataUpdated
  | LeaseActivated
  | LeaseEnded
  | LeaseDocumentAttached;
