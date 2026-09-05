import type { DomainEvent } from "@moonship/shared";

import type { StaffRole } from "../aggregates/staff-member";

export interface StaffMemberProvisioned extends DomainEvent {
  readonly eventType: "StaffMemberProvisioned";
  readonly payload: {
    readonly authUserId: string;
    readonly role: StaffRole;
  };
}

export interface RoleChanged extends DomainEvent {
  readonly eventType: "RoleChanged";
  readonly payload: {
    readonly role: StaffRole;
  };
}

export interface StaffMemberDeactivated extends DomainEvent {
  readonly eventType: "StaffMemberDeactivated";
  readonly payload: Record<string, never>;
}

export type StaffMemberEvent =
  | StaffMemberProvisioned
  | RoleChanged
  | StaffMemberDeactivated;
