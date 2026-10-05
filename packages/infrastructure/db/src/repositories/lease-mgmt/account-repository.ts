import { and, eq, inArray, sql } from "drizzle-orm";

import type { EventDispatcher } from "@moonship/events";
import type { AccountRepository } from "@moonship/lease-mgmt";
import { Account, StaleAccountError } from "@moonship/lease-mgmt";

import type { DbExecutor } from "../../client";
import {
  accounts,
  leaseEstimateSteps,
  leaseFixedChargeSteps,
  leaseRentSteps,
  leases,
} from "../../schemas/lease-mgmt/schema";
import { loadLeases, toAccountView } from "./account-rows";

export class PGAccountRepository implements AccountRepository {
  constructor(
    private db: DbExecutor,
    private eventDispatcher?: EventDispatcher,
  ) {}

  async findById(propertyId: string, id: string): Promise<Account | null> {
    const row = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    const leasesByAccount = await loadLeases(this.db, [row.id]);
    return Account.reconstitute(toAccountView(row, leasesByAccount));
  }

  async save(account: Account): Promise<void> {
    const events = account.pullEvents();
    const accountLeases = account.leases;

    await this.db.transaction(async (tx) => {
      const values = {
        tenantId: account.tenantId,
        unitId: account.unitId,
        openingBalanceCents: account.openingBalanceCents,
      };
      const saved = await tx
        .insert(accounts)
        .values({
          id: account.id,
          propertyId: account.propertyId,
          version: account.version + 1,
          ...values,
        })
        .onConflictDoUpdate({
          target: accounts.id,
          set: {
            ...values,
            version: sql`${accounts.version} + 1`,
            updatedAt: new Date(),
          },
          setWhere: and(
            eq(accounts.propertyId, account.propertyId),
            eq(accounts.version, account.version),
          ),
        })
        .returning({ id: accounts.id });
      if (saved.length === 0) {
        const [stored] = await tx
          .select({ propertyId: accounts.propertyId })
          .from(accounts)
          .where(eq(accounts.id, account.id));
        if (stored?.propertyId === account.propertyId) {
          throw new StaleAccountError();
        }
        throw new Error(`Account ${account.id} belongs to another property`);
      }

      const existing = await tx
        .select({ id: leases.id })
        .from(leases)
        .where(eq(leases.accountId, account.id));
      const keep = new Set(accountLeases.map((lease) => lease.id));
      const removed = existing
        .map((row) => row.id)
        .filter((id) => !keep.has(id));
      if (removed.length > 0) {
        await tx.delete(leases).where(inArray(leases.id, removed));
      }

      for (const lease of accountLeases) {
        const leaseValues = {
          startDate: lease.startDate,
          endDate: lease.endDate,
          moveOutDate: lease.moveOutDate,
          lateFeeCents: lease.lateFee?.amountCents ?? null,
          lateFeeDay: lease.lateFee?.day ?? null,
          insuranceExpiresOn: lease.insuranceExpiresOn,
        };
        const upserted = await tx
          .insert(leases)
          .values({ id: lease.id, accountId: account.id, ...leaseValues })
          .onConflictDoUpdate({
            target: leases.id,
            set: { ...leaseValues, updatedAt: new Date() },
            setWhere: eq(leases.accountId, account.id),
          })
          .returning({ id: leases.id });
        if (upserted.length === 0) {
          throw new Error(`Lease ${lease.id} belongs to another account`);
        }
      }

      const leaseIds = accountLeases.map((lease) => lease.id);
      await tx
        .delete(leaseRentSteps)
        .where(inArray(leaseRentSteps.leaseId, leaseIds));
      await tx
        .delete(leaseEstimateSteps)
        .where(inArray(leaseEstimateSteps.leaseId, leaseIds));
      await tx
        .delete(leaseFixedChargeSteps)
        .where(inArray(leaseFixedChargeSteps.leaseId, leaseIds));

      const rentRows = accountLeases.flatMap((lease) =>
        lease.rentSteps.map((step) => ({
          id: step.id,
          leaseId: lease.id,
          startsOn: step.startsOn,
          amountCents: step.amountCents,
          tenantNotifiedAt: step.tenantNotifiedAt,
        })),
      );
      if (rentRows.length > 0) {
        await tx.insert(leaseRentSteps).values(rentRows);
      }
      const estimateRows = accountLeases.flatMap((lease) =>
        lease.estimateSteps.map((step) => ({
          id: step.id,
          leaseId: lease.id,
          poolId: step.poolId,
          startsOn: step.startsOn,
          amountCents: step.amountCents,
        })),
      );
      if (estimateRows.length > 0) {
        await tx.insert(leaseEstimateSteps).values(estimateRows);
      }
      const fixedChargeRows = accountLeases.flatMap((lease) =>
        lease.fixedChargeSteps.map((step) => ({
          id: step.id,
          leaseId: lease.id,
          name: step.name,
          startsOn: step.startsOn,
          amountCents: step.amountCents,
        })),
      );
      if (fixedChargeRows.length > 0) {
        await tx.insert(leaseFixedChargeSteps).values(fixedChargeRows);
      }
    });
    account.markSaved();

    if (this.eventDispatcher && events.length > 0) {
      await this.eventDispatcher.dispatch(events);
    }
  }

  async delete(propertyId: string, id: string): Promise<void> {
    await this.db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.propertyId, propertyId)));
  }
}
