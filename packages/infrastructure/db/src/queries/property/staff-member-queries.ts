import { eq } from "drizzle-orm";

import type {
  StaffMemberQueries,
  StaffMemberView,
  StaffRole,
} from "@moonship/property";

import type { DatabaseClient } from "../../client";
import { user as operatorUser } from "../../schemas/auth-operator/schema";
import { staffMembers } from "../../schemas/property/schema";

export class PGStaffMemberQueries implements StaffMemberQueries {
  constructor(private db: DatabaseClient) {}

  async getByAuthUserId(authUserId: string): Promise<StaffMemberView | null> {
    const row = await this.db
      .select({
        id: staffMembers.id,
        authUserId: staffMembers.authUserId,
        role: staffMembers.role,
        status: staffMembers.status,
        email: operatorUser.email,
        name: operatorUser.name,
      })
      .from(staffMembers)
      .leftJoin(operatorUser, eq(staffMembers.authUserId, operatorUser.id))
      .where(eq(staffMembers.authUserId, authUserId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;

    return {
      id: row.id,
      authUserId: row.authUserId,
      role: row.role as StaffRole,
      status: row.status,
      email: row.email ?? "",
      name: row.name ?? "",
    };
  }

  async list(): Promise<StaffMemberView[]> {
    const rows = await this.db
      .select({
        id: staffMembers.id,
        authUserId: staffMembers.authUserId,
        role: staffMembers.role,
        status: staffMembers.status,
        email: operatorUser.email,
        name: operatorUser.name,
      })
      .from(staffMembers)
      .leftJoin(operatorUser, eq(staffMembers.authUserId, operatorUser.id));

    return rows.map((row) => ({
      id: row.id,
      authUserId: row.authUserId,
      role: row.role as StaffRole,
      status: row.status,
      email: row.email ?? "",
      name: row.name ?? "",
    }));
  }
}
