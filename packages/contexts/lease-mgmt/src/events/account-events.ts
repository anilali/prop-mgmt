import type { DomainEvent } from "@moonship/shared";

export interface AccountOpened extends DomainEvent {
  readonly eventType: "AccountOpened";
  readonly payload: {
    readonly propertyId: string;
    readonly tenantId: string;
    readonly unitId: string;
  };
}

export interface LeaseAdded extends DomainEvent {
  readonly eventType: "LeaseAdded";
  readonly payload: { readonly leaseId: string };
}

export interface LeaseUpdated extends DomainEvent {
  readonly eventType: "LeaseUpdated";
  readonly payload: { readonly leaseId: string };
}

export interface LeaseRemoved extends DomainEvent {
  readonly eventType: "LeaseRemoved";
  readonly payload: { readonly leaseId: string };
}

export type AccountEvent =
  | AccountOpened
  | LeaseAdded
  | LeaseUpdated
  | LeaseRemoved;
