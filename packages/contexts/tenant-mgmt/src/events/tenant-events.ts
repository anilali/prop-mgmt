import type { DomainEvent } from "@moonship/shared";

export interface TenantCreated extends DomainEvent {
  readonly eventType: "TenantCreated";
  readonly payload: {
    readonly propertyId: string;
    readonly businessName: string;
  };
}

export interface TenantUpdated extends DomainEvent {
  readonly eventType: "TenantUpdated";
}

export interface TenantArchived extends DomainEvent {
  readonly eventType: "TenantArchived";
}

export type TenantEvent = TenantCreated | TenantUpdated | TenantArchived;
