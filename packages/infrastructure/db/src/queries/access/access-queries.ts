import { and, eq, isNull } from "drizzle-orm";

import type {
  AccessQueries,
  MembershipStatus,
  MembershipView,
  Role,
} from "@moonship/access";

import type { DatabaseClient } from "../../client";
import { accessMemberships } from "../../schemas/access/schema";

export class PGAccessQueries implements AccessQueries {
  constructor(private db: DatabaseClient) {}

  async getMemberships(propertyId: string): Promise<MembershipView[]> {
    const rows = await this.db
      .select()
      .from(accessMemberships)
      .where(eq(accessMemberships.propertyId, propertyId));
    return rows.map(toView);
  }

  async listByAuthUserId(authUserId: string): Promise<MembershipView[]> {
    const rows = await this.db
      .select()
      .from(accessMemberships)
      .where(eq(accessMemberships.authUserId, authUserId));
    return rows.map(toView);
  }

  async listUnclaimedPropertyIdsByEmail(email: string): Promise<string[]> {
    const normalized = email.trim().toLowerCase();
    const rows = await this.db
      .selectDistinct({ propertyId: accessMemberships.propertyId })
      .from(accessMemberships)
      .where(
        and(
          eq(accessMemberships.email, normalized),
          isNull(accessMemberships.authUserId),
        ),
      );
    return rows.map((row) => row.propertyId);
  }

}

function toView(row: typeof accessMemberships.$inferSelect): MembershipView {
  return {
    id: row.id,
    propertyId: row.propertyId,
    email: row.email,
    role: row.role as Role,
    status: row.status as MembershipStatus,
    authUserId: row.authUserId,
  };
}
