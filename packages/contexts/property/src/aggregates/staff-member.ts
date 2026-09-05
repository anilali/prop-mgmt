import type { DomainEvent } from "@moonship/shared";

import type {
  RoleChanged,
  StaffMemberDeactivated,
  StaffMemberProvisioned,
} from "../events/staff-member-events";

export type StaffRole = "admin" | "staff";

export interface StaffMemberProps {
  id: string;
  authUserId: string;
  role: StaffRole;
  status: "active" | "deactivated";
}

export class StaffMember {
  private props: StaffMemberProps;
  private events: DomainEvent[] = [];

  private constructor(props: StaffMemberProps) {
    this.props = props;
  }

  static create(props: StaffMemberProps): StaffMember {
    const member = new StaffMember(props);
    const event: StaffMemberProvisioned = {
      eventType: "StaffMemberProvisioned",
      occurredAt: new Date(),
      aggregateId: props.id,
      payload: {
        authUserId: props.authUserId,
        role: props.role,
      },
    };
    member.addEvent(event);
    return member;
  }

  static reconstitute(props: StaffMemberProps): StaffMember {
    return new StaffMember(props);
  }

  get id(): string {
    return this.props.id;
  }

  get authUserId(): string {
    return this.props.authUserId;
  }

  get role(): StaffRole {
    return this.props.role;
  }

  get status(): "active" | "deactivated" {
    return this.props.status;
  }

  changeRole(role: StaffRole): void {
    if (this.props.role === role) return;

    this.props.role = role;
    const event: RoleChanged = {
      eventType: "RoleChanged",
      occurredAt: new Date(),
      aggregateId: this.props.id,
      payload: { role },
    };
    this.addEvent(event);
  }

  deactivate(): void {
    this.props.status = "deactivated";
    const event: StaffMemberDeactivated = {
      eventType: "StaffMemberDeactivated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
      payload: {},
    };
    this.addEvent(event);
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }
}
