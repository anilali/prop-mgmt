import type { DomainEvent } from "@moonship/shared";

import type {
  MembershipClaimed,
  MembershipGranted,
  MembershipReactivated,
  MembershipRevoked,
  MembershipRoleChanged,
} from "../events/access-events";
import { EmailAddress } from "../value-objects/email-address";

export type Role = "admin" | "staff";

export type MembershipStatus = "active" | "revoked";

export interface MembershipProps {
  id: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  authUserId?: string | null;
}

export interface PropertyAccessProps {
  propertyId: string;
  memberships: MembershipProps[];
  version: number;
}

export class PropertyAccess {
  private props: {
    propertyId: string;
    memberships: MembershipProps[];
    version: number;
  };
  private events: DomainEvent[] = [];

  private constructor(props: PropertyAccessProps) {
    this.props = {
      propertyId: props.propertyId,
      memberships: props.memberships.map((m) => ({ ...m })),
      version: props.version,
    };
  }

  static create(props: { propertyId: string }): PropertyAccess {
    return new PropertyAccess({
      propertyId: props.propertyId,
      memberships: [],
      version: 0,
    });
  }

  static reconstitute(props: PropertyAccessProps): PropertyAccess {
    return new PropertyAccess(props);
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get version(): number {
    return this.props.version;
  }

  get memberships(): MembershipProps[] {
    return this.props.memberships.map((m) => ({ ...m }));
  }

  findByEmail(email: string): MembershipProps | null {
    const normalized = EmailAddress.parse(email).value;
    const found = this.props.memberships.find((m) => m.email === normalized);
    return found ? { ...found } : null;
  }

  grantMembership(input: {
    membershipId: string;
    email: string;
    role: Role;
    actedByAuthUserId: string;
  }): void {
    const email = EmailAddress.parse(input.email).value;
    if (this.props.memberships.some((m) => m.email === email)) {
      throw new Error(
        `Membership already exists for ${email} on property ${this.props.propertyId}`,
      );
    }
    if (input.role === "staff") {
      this.assertActiveAdminExists(`grant staff membership for ${email}`);
    }

    this.props.memberships.push({
      id: input.membershipId,
      email,
      role: input.role,
      status: "active",
      authUserId: null,
    });
    this.bumpVersion();

    const event: MembershipGranted = {
      eventType: "MembershipGranted",
      occurredAt: new Date(),
      aggregateId: this.props.propertyId,
      propertyId: this.props.propertyId,
      membershipId: input.membershipId,
      payload: {
        email,
        role: input.role,
        authUserId: null,
        actedByAuthUserId: input.actedByAuthUserId,
      },
    };
    this.addEvent(event);
  }

  reactivateMembership(
    membershipId: string,
    role: Role,
    actedByAuthUserId: string,
  ): void {
    const membership = this.requireMembership(membershipId);
    if (membership.status === "active") {
      throw new Error(
        `Membership ${membershipId} is already active on property ${this.props.propertyId}`,
      );
    }
    if (role === "staff") {
      this.assertActiveAdminExists(
        `reactivate membership ${membershipId} as staff`,
      );
    }

    membership.status = "active";
    membership.role = role;
    this.bumpVersion();

    const event: MembershipReactivated = {
      eventType: "MembershipReactivated",
      occurredAt: new Date(),
      aggregateId: this.props.propertyId,
      propertyId: this.props.propertyId,
      membershipId,
      payload: { role: membership.role, actedByAuthUserId },
    };
    this.addEvent(event);
  }

  changeMembershipRole(
    membershipId: string,
    role: Role,
    actedByAuthUserId: string,
  ): void {
    const membership = this.requireMembership(membershipId);
    this.requireActive(membership, "change role on");
    if (membership.role === role) return;

    if (membership.role === "admin" && role !== "admin") {
      this.assertNotLastActiveAdmin(membership.id);
    }

    membership.role = role;
    this.bumpVersion();

    const event: MembershipRoleChanged = {
      eventType: "MembershipRoleChanged",
      occurredAt: new Date(),
      aggregateId: this.props.propertyId,
      propertyId: this.props.propertyId,
      membershipId,
      payload: { role, actedByAuthUserId },
    };
    this.addEvent(event);
  }

  revokeMembership(membershipId: string, actedByAuthUserId: string): void {
    const membership = this.requireMembership(membershipId);
    this.requireActive(membership, "revoke");
    if (membership.role === "admin") {
      this.assertNotLastActiveAdmin(membership.id);
    }

    membership.status = "revoked";
    this.bumpVersion();

    const event: MembershipRevoked = {
      eventType: "MembershipRevoked",
      occurredAt: new Date(),
      aggregateId: this.props.propertyId,
      propertyId: this.props.propertyId,
      membershipId,
      payload: { actedByAuthUserId },
    };
    this.addEvent(event);
  }

  claimMemberships(email: string, authUserId: string): string[] {
    const normalized = EmailAddress.parse(email).value;
    const claimed: string[] = [];

    for (const membership of this.props.memberships) {
      if (membership.email !== normalized) continue;
      if (membership.authUserId) continue;
      membership.authUserId = authUserId;
      claimed.push(membership.id);

      const event: MembershipClaimed = {
        eventType: "MembershipClaimed",
        occurredAt: new Date(),
        aggregateId: this.props.propertyId,
        propertyId: this.props.propertyId,
        membershipId: membership.id,
        payload: { authUserId },
      };
      this.addEvent(event);
    }

    if (claimed.length > 0) this.bumpVersion();
    return claimed;
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  private requireMembership(membershipId: string): MembershipProps {
    const membership = this.props.memberships.find(
      (m) => m.id === membershipId,
    );
    if (!membership) {
      throw new Error(
        `Membership ${membershipId} not found on property ${this.props.propertyId}`,
      );
    }
    return membership;
  }

  private requireActive(membership: MembershipProps, action: string): void {
    if (membership.status !== "active") {
      throw new Error(
        `Cannot ${action} revoked membership ${membership.id}; reactivate it first`,
      );
    }
  }

  private assertActiveAdminExists(action: string): void {
    const hasActiveAdmin = this.props.memberships.some(
      (m) => m.status === "active" && m.role === "admin",
    );
    if (!hasActiveAdmin) {
      throw new Error(
        `Cannot ${action} on property ${this.props.propertyId} while no active admin exists`,
      );
    }
  }

  private assertNotLastActiveAdmin(excludingMembershipId: string): void {
    const otherActiveAdmins = this.props.memberships.filter(
      (m) =>
        m.id !== excludingMembershipId &&
        m.status === "active" &&
        m.role === "admin",
    );
    if (otherActiveAdmins.length === 0) {
      throw new Error(
        `Cannot remove the last active admin on property ${this.props.propertyId}`,
      );
    }
  }

  private bumpVersion(): void {
    this.props.version += 1;
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }
}
