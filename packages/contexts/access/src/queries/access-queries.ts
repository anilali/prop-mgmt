import type { MembershipStatus, Role } from "../aggregates/property-access";

export interface MembershipView {
  id: string;
  propertyId: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  authUserId: string | null;
}

export interface AccessQueries {
  getMemberships(propertyId: string): Promise<MembershipView[]>;
  listByAuthUserId(authUserId: string): Promise<MembershipView[]>;
  listUnclaimedPropertyIdsByEmail(email: string): Promise<string[]>;
}
