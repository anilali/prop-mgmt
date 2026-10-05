import { and, eq } from "drizzle-orm";

import type {
  MembershipStatus,
  PropertyAccessRepository,
  Role,
} from "@moonship/access";
import type { EventDispatcher } from "@moonship/events";
import { OptimisticConcurrencyError, PropertyAccess } from "@moonship/access";

import type { DbExecutor } from "../../client";
import { accessMemberships, propertyAccess } from "../../schemas/access/schema";

export class PGPropertyAccessRepository implements PropertyAccessRepository {
  constructor(
    private db: DbExecutor,
    private eventDispatcher?: EventDispatcher,
  ) {}

  async findByPropertyId(propertyId: string): Promise<PropertyAccess | null> {
    const head = await this.db
      .select()
      .from(propertyAccess)
      .where(eq(propertyAccess.propertyId, propertyId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!head) return null;

    const rows = await this.db
      .select()
      .from(accessMemberships)
      .where(eq(accessMemberships.propertyId, propertyId));

    return PropertyAccess.reconstitute({
      propertyId: head.propertyId,
      version: head.version,
      memberships: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role as Role,
        status: row.status as MembershipStatus,
        authUserId: row.authUserId,
      })),
    });
  }

  async save(access: PropertyAccess, expectedVersion: number): Promise<void> {
    const events = access.pullEvents();

    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(propertyAccess)
        .values({
          propertyId: access.propertyId,
          version: access.version,
        })
        .onConflictDoNothing({ target: propertyAccess.propertyId })
        .returning({ propertyId: propertyAccess.propertyId });

      if (inserted.length === 0) {
        const updated = await tx
          .update(propertyAccess)
          .set({ version: access.version, updatedAt: new Date() })
          .where(
            and(
              eq(propertyAccess.propertyId, access.propertyId),
              eq(propertyAccess.version, expectedVersion),
            ),
          )
          .returning({ propertyId: propertyAccess.propertyId });
        if (updated.length === 0) {
          throw new OptimisticConcurrencyError(
            `Concurrent update on property access ${access.propertyId}: expected version ${expectedVersion}`,
          );
        }
      } else if (expectedVersion !== 0) {
        throw new OptimisticConcurrencyError(
          `Concurrent update on property access ${access.propertyId}: expected version ${expectedVersion}, row did not exist`,
        );
      }

      await tx
        .delete(accessMemberships)
        .where(eq(accessMemberships.propertyId, access.propertyId));
      const memberships = access.memberships;
      if (memberships.length > 0) {
        await tx.insert(accessMemberships).values(
          memberships.map((m) => ({
            id: m.id,
            propertyId: access.propertyId,
            email: m.email,
            role: m.role,
            status: m.status,
            authUserId: m.authUserId ?? null,
          })),
        );
      }
    });

    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }
}
