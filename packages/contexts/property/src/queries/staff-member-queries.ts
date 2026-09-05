import type { StaffRole } from "../aggregates/staff-member";

export interface StaffMemberView {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: StaffRole;
  status: string;
}

export interface StaffMemberQueries {
  getByAuthUserId(authUserId: string): Promise<StaffMemberView | null>;
  list(): Promise<StaffMemberView[]>;
}
