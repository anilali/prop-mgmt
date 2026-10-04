export { EmailAddress } from "./value-objects/email-address";

export { PlatformAdmin } from "./entities/platform-admin";
export type { PlatformAdminProps } from "./entities/platform-admin";

export { PropertyAccess } from "./aggregates/property-access";
export type {
  MembershipProps,
  MembershipStatus,
  PropertyAccessProps,
  Role,
} from "./aggregates/property-access";

export type {
  AccessEvent,
  MembershipClaimed,
  MembershipGranted,
  MembershipReactivated,
  MembershipRevoked,
  MembershipRoleChanged,
  PropertyAccessEvent,
} from "./events/access-events";

export {
  canManageAccess,
  canOperate,
  canRegisterProperty,
  isPlatformAdmin,
} from "./policies/access-policies";
export type {
  AccessMembership,
  AccessState,
  AccessSubject,
} from "./policies/access-policies";

export { OptimisticConcurrencyError } from "./repositories/access-repositories";
export type {
  PlatformAdminRepository,
  PropertyAccessRepository,
} from "./repositories/access-repositories";

export type { AccessQueries, MembershipView } from "./queries/access-queries";
