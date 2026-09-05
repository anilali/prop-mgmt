import type { DomainEvent } from "@moonship/shared";

export interface PropertyRegistered extends DomainEvent {
  readonly eventType: "PropertyRegistered";
}

export interface PropertyMetadataUpdated extends DomainEvent {
  readonly eventType: "PropertyMetadataUpdated";
}

export type PropertyEvent = PropertyRegistered | PropertyMetadataUpdated;
