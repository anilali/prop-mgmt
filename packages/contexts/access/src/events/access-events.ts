import type { DomainEvent } from "@moonship/shared";

import type { Role } from "../aggregates/property-access";

export interface AccessEvent extends DomainEvent {
  readonly propertyId: string;
  readonly membershipId: string;
}

export interface MembershipGranted extends AccessEvent {
  readonly eventType: "MembershipGranted";
  readonly payload: {
    readonly email: string;
    readonly role: Role;
    readonly authUserId?: string | null;
    readonly actedByAuthUserId: string;
  };
}

export interface MembershipReactivated extends AccessEvent {
  readonly eventType: "MembershipReactivated";
  readonly payload: {
    readonly role: Role;
    readonly actedByAuthUserId: string;
  };
}

export interface MembershipRoleChanged extends AccessEvent {
  readonly eventType: "MembershipRoleChanged";
  readonly payload: {
    readonly role: Role;
    readonly actedByAuthUserId: string;
  };
}

export interface MembershipRevoked extends AccessEvent {
  readonly eventType: "MembershipRevoked";
  readonly payload: {
    readonly actedByAuthUserId: string;
  };
}

export interface MembershipClaimed extends AccessEvent {
  readonly eventType: "MembershipClaimed";
  readonly payload: {
    readonly authUserId: string;
  };
}

export type PropertyAccessEvent =
  | MembershipGranted
  | MembershipReactivated
  | MembershipRoleChanged
  | MembershipRevoked
  | MembershipClaimed;
