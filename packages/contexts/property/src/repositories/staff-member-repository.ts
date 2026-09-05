import type { StaffMember } from "../aggregates/staff-member";

export interface StaffMemberRepository {
  findById(id: string): Promise<StaffMember | null>;
  save(staffMember: StaffMember): Promise<void>;
}
