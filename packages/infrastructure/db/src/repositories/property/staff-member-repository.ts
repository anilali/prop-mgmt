import { eq } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type { StaffMemberRepository, StaffRole } from "@moonship/property";
import { StaffMember } from "@moonship/property";

import type { DatabaseClient } from "../../client";
import { staffMembers } from "../../schemas/property/schema";

export class PGStaffMemberRepository implements StaffMemberRepository {
  constructor(
    private db: DatabaseClient,
    private eventDispatcher?: EventDispatcher,
  ) {}

  async findById(id: string): Promise<StaffMember | null> {
    const row = await this.db
      .select()
      .from(staffMembers)
      .where(eq(staffMembers.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;
    return this.toAggregate(row);
  }

  async save(staffMember: StaffMember): Promise<void> {
    const events = staffMember.pullEvents();

    await this.db
      .insert(staffMembers)
      .values({
        id: staffMember.id,
        authUserId: staffMember.authUserId,
        role: staffMember.role,
        status: staffMember.status,
      })
      .onConflictDoUpdate({
        target: staffMembers.id,
        set: {
          role: staffMember.role,
          status: staffMember.status,
          updatedAt: new Date(),
        },
      });

    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }

  private toAggregate(row: typeof staffMembers.$inferSelect): StaffMember {
    return StaffMember.reconstitute({
      id: row.id,
      authUserId: row.authUserId,
      role: row.role as StaffRole,
      status: row.status as "active" | "deactivated",
    });
  }
}
