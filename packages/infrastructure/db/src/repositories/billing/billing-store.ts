import { and, eq, inArray } from "drizzle-orm";

import type { BillingStore, Category, Pool } from "@moonship/billing";
import type { IsoDate } from "@moonship/shared";

import type { DbExecutor } from "../../client";
import {
  categories,
  costPools,
  costPoolUnits,
} from "../../schemas/billing/schema";
import { loadCategories, loadPools } from "./billing-rows";

export class PGBillingStore implements BillingStore {
  constructor(private db: DbExecutor) {}

  listPools(propertyId: string): Promise<Pool[]> {
    return loadPools(this.db, propertyId);
  }

  listCategories(propertyId: string): Promise<Category[]> {
    return loadCategories(this.db, propertyId);
  }

  async savePool(pool: Pool): Promise<void> {
    await this.db.transaction(async (tx) => {
      const values = {
        name: pool.name,
        letterName: pool.letterName,
        addsNewUnits: pool.addsNewUnits,
        sortOrder: pool.sortOrder,
        membersChangedOn: pool.membersChangedOn,
      };
      const saved = await tx
        .insert(costPools)
        .values({ id: pool.id, propertyId: pool.propertyId, ...values })
        .onConflictDoUpdate({
          target: costPools.id,
          set: { ...values, updatedAt: new Date() },
          setWhere: eq(costPools.propertyId, pool.propertyId),
        })
        .returning({ id: costPools.id });
      if (saved.length === 0) {
        throw new Error(`Pool ${pool.id} belongs to another property`);
      }
      await tx.delete(costPoolUnits).where(eq(costPoolUnits.poolId, pool.id));
      if (pool.unitIds.length > 0) {
        await tx.insert(costPoolUnits).values(
          pool.unitIds.map((unitId) => ({
            poolId: pool.id,
            unitId,
            propertyId: pool.propertyId,
          })),
        );
      }
    });
  }

  async deletePool(propertyId: string, poolId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(categories)
        .where(
          and(
            eq(categories.propertyId, propertyId),
            eq(categories.poolId, poolId),
          ),
        );
      await tx
        .delete(costPools)
        .where(
          and(eq(costPools.propertyId, propertyId), eq(costPools.id, poolId)),
        );
    });
  }

  async saveCategory(category: Category): Promise<void> {
    const values = {
      name: category.name,
      kind: category.kind,
      poolId: category.poolId,
      archivedAt: category.archivedAt,
    };
    const saved = await this.db
      .insert(categories)
      .values({ id: category.id, propertyId: category.propertyId, ...values })
      .onConflictDoUpdate({
        target: categories.id,
        set: { ...values, updatedAt: new Date() },
        setWhere: eq(categories.propertyId, category.propertyId),
      })
      .returning({ id: categories.id });
    if (saved.length === 0) {
      throw new Error(`Category ${category.id} belongs to another property`);
    }
  }

  async addPoolMember(
    propertyId: string,
    poolId: string,
    unitId: string,
    changedOn: IsoDate | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [pool] = await tx
        .select({ id: costPools.id })
        .from(costPools)
        .where(
          and(eq(costPools.propertyId, propertyId), eq(costPools.id, poolId)),
        );
      if (!pool) {
        throw new Error(`Pool ${poolId} belongs to another property`);
      }
      const added = await tx
        .insert(costPoolUnits)
        .values({ poolId, unitId, propertyId })
        .onConflictDoNothing()
        .returning({ poolId: costPoolUnits.poolId });
      if (changedOn === null || added.length === 0) return;
      await tx
        .update(costPools)
        .set({ membersChangedOn: changedOn, updatedAt: new Date() })
        .where(
          and(eq(costPools.propertyId, propertyId), eq(costPools.id, poolId)),
        );
    });
  }

  async removeUnitFromPools(
    propertyId: string,
    unitId: string,
    changedOn: IsoDate | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(costPoolUnits)
        .where(
          and(
            eq(costPoolUnits.propertyId, propertyId),
            eq(costPoolUnits.unitId, unitId),
          ),
        )
        .returning({ poolId: costPoolUnits.poolId });
      if (changedOn === null || removed.length === 0) return;
      await tx
        .update(costPools)
        .set({ membersChangedOn: changedOn, updatedAt: new Date() })
        .where(
          and(
            eq(costPools.propertyId, propertyId),
            inArray(
              costPools.id,
              removed.map((row) => row.poolId),
            ),
          ),
        );
    });
  }
}
