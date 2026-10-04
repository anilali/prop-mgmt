export type ProjectionName = "operator-membership-directory";

export interface OperatorMembershipDirectoryRow {
  membershipId: string;
  authUserId: string;
  role: string;
  status: string;
  email: string;
  name: string;
}
