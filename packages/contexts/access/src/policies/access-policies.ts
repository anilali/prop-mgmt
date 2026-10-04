import type { MembershipStatus, Role } from "../aggregates/property-access";
import type { PlatformAdmin } from "../entities/platform-admin";

export interface AccessSubject {
  authUserId: string;
  email: string;
}

export interface AccessMembership {
  propertyId: string;
  email: string;
  authUserId?: string | null;
  role: Role;
  status: MembershipStatus;
}

export interface AccessState {
  platformAdmins: readonly PlatformAdmin[];
  memberships: readonly AccessMembership[];
}

export function isPlatformAdmin(
  subject: AccessSubject,
  state: AccessState,
): boolean {
  if (!subject.authUserId) return false;
  return state.platformAdmins.some(
    (admin) =>
      admin.authUserId != null && admin.authUserId === subject.authUserId,
  );
}

function hasActiveMembership(
  subject: AccessSubject,
  propertyId: string,
  state: AccessState,
  role?: Role,
): boolean {
  if (!subject.authUserId) return false;
  return state.memberships.some(
    (m) =>
      m.propertyId === propertyId &&
      m.status === "active" &&
      (role === undefined || m.role === role) &&
      m.authUserId != null &&
      m.authUserId === subject.authUserId,
  );
}

export function canOperate(
  subject: AccessSubject,
  propertyId: string,
  state: AccessState,
): boolean {
  return hasActiveMembership(subject, propertyId, state);
}

export function canManageAccess(
  subject: AccessSubject,
  propertyId: string,
  state: AccessState,
): boolean {
  return (
    isPlatformAdmin(subject, state) ||
    hasActiveMembership(subject, propertyId, state, "admin")
  );
}

export function canRegisterProperty(
  subject: AccessSubject,
  state: AccessState,
): boolean {
  return isPlatformAdmin(subject, state);
}
