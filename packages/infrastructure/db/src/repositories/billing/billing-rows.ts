import { asc, eq } from "drizzle-orm";

import type { Category, CategoryKind, Pool } from "@moonship/billing";

import type { DbExecutor } from "../../client";
import {
  categories,
  costPools,
  costPoolUnits,
} from "../../schemas/billing/schema";

export async function loadPools(
  db: DbExecutor,
  propertyId: string,
): Promise<Pool[]> {
  const poolRows = await db
    .select()
    .from(costPools)
    .where(eq(costPools.propertyId, propertyId))
    .orderBy(asc(costPools.sortOrder), asc(costPools.name));
  const memberRows = await db
    .select()
    .from(costPoolUnits)
    .where(eq(costPoolUnits.propertyId, propertyId));
  return poolRows.map((row) => ({
    id: row.id,
    propertyId: row.propertyId,
    name: row.name,
    letterName: row.letterName,
    addsNewUnits: row.addsNewUnits,
    sortOrder: row.sortOrder,
    membersChangedOn: row.membersChangedOn,
    unitIds: memberRows
      .filter((member) => member.poolId === row.id)
      .map((member) => member.unitId),
  }));
}

export async function loadCategories(
  db: DbExecutor,
  propertyId: string,
): Promise<Category[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.propertyId, propertyId))
    .orderBy(asc(categories.name));
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.propertyId,
    name: row.name,
    kind: row.kind as CategoryKind,
    poolId: row.poolId,
    archivedAt: row.archivedAt,
  }));
}
