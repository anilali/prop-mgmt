import { and, eq, isNull } from "drizzle-orm";

import type { PlatformAdminRepository } from "@moonship/access";
import { PlatformAdmin } from "@moonship/access";

import type { DatabaseClient } from "../../client";
import { platformAdmins } from "../../schemas/access/schema";

export class PGPlatformAdminRepository implements PlatformAdminRepository {
  constructor(private db: DatabaseClient) {}

  async findByAuthUserId(authUserId: string): Promise<PlatformAdmin | null> {
    const row = await this.db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.authUserId, authUserId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    return PlatformAdmin.reconstitute({
      id: row.id,
      email: row.email,
      authUserId: row.authUserId,
    });
  }

  async claimByEmail(email: string, authUserId: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const rows = await this.db
      .update(platformAdmins)
      .set({ authUserId, updatedAt: new Date() })
      .where(
        and(
          eq(platformAdmins.email, normalized),
          isNull(platformAdmins.authUserId),
        ),
      )
      .returning({ id: platformAdmins.id });
    return rows.length > 0;
  }
}
