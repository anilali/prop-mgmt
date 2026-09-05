/**
 * Cross-context read models live here.
 * First planned projection: operator staff directory (property staff + auth_operator user).
 */

export type ProjectionName = "operator-staff-directory";

export interface OperatorStaffDirectoryRow {
  staffMemberId: string;
  authUserId: string;
  role: string;
  status: string;
  email: string;
  name: string;
}
