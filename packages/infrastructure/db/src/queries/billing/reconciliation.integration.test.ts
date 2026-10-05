import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDb } from "../../client";
import { PGBillingStore } from "../../repositories/billing/billing-store";
import {
  costPools,
  poolBillOverrides,
  reconciliationYears,
} from "../../schemas/billing/schema";
import { createPGUnitOfWork } from "../../unit-of-work";
import { PGBillingQueries } from "./billing-queries";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("reconciliation years and bill amounts", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const unitOfWork = createPGUnitOfWork(db);
  const store = new PGBillingStore(db);
  const queries = new PGBillingQueries(db);
  const propertyIds: string[] = [];

  afterAll(async () => {
    if (propertyIds.length > 0) {
      await db
        .delete(poolBillOverrides)
        .where(inArray(poolBillOverrides.propertyId, propertyIds));
      await db
        .delete(reconciliationYears)
        .where(inArray(reconciliationYears.propertyId, propertyIds));
      await db
        .delete(costPools)
        .where(inArray(costPools.propertyId, propertyIds));
    }
    await db.$client.end({ timeout: 5 });
  });

  async function seedPool() {
    const propertyId = randomUUID();
    propertyIds.push(propertyId);
    const poolId = randomUUID();
    await store.savePool({
      id: poolId,
      propertyId,
      name: "Taxes",
      letterName: "tax",
      addsNewUnits: true,
      sortOrder: 0,
      membersChangedOn: null,
      unitIds: [],
    });
    return { propertyId, poolId };
  }

  it("creates a year once and keeps its letter date", async () => {
    const { propertyId } = await seedPool();

    const first = await unitOfWork.run((stores) =>
      stores.billing.lockYear(propertyId, 2026),
    );
    await store.saveYear({ ...first, letterDate: "2027-01-04" });
    const second = await unitOfWork.run((stores) =>
      stores.billing.lockYear(propertyId, 2026),
    );

    expect(second.id).toBe(first.id);
    expect(second.letterDate).toBe("2027-01-04");
    expect(second.status).toBe("draft");
    expect(await queries.listReconciliationYears(propertyId)).toHaveLength(1);
    expect(await queries.listFinalizedYears(propertyId)).toEqual([]);

    await store.saveYear({
      ...second,
      status: "finalized",
      finalizedAt: new Date(),
    });
    expect(await queries.listFinalizedYears(propertyId)).toEqual([2026]);
  });

  it("rejects a finalized year without a letter date", async () => {
    const { propertyId } = await seedPool();
    const year = await store.lockYear(propertyId, 2026);

    await expect(
      store.saveYear({ ...year, status: "finalized", finalizedAt: new Date() }),
    ).rejects.toThrow();
  });

  it("replaces a bill amount for the same pool and year, and deletes it", async () => {
    const { propertyId, poolId } = await seedPool();
    const year = await store.lockYear(propertyId, 2025);
    const base = {
      propertyId,
      reconciliationYearId: year.id,
      year: 2025,
      poolId,
    };

    await store.saveBillOverride({
      ...base,
      id: randomUUID(),
      amountCents: 3_000_000,
      note: "First bill",
    });
    await store.saveBillOverride({
      ...base,
      id: randomUUID(),
      amountCents: 3_354_231,
      note: " 2025 county bill ",
    });

    const overrides = await queries.listBillOverrides(propertyId);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      year: 2025,
      poolId,
      amountCents: 3_354_231,
      note: "2025 county bill",
    });

    expect(await store.deleteBillOverride(propertyId, year.id, poolId)).toBe(
      true,
    );
    expect(await queries.listBillOverrides(propertyId)).toEqual([]);
  });

  it("rejects a negative bill amount and an empty note", async () => {
    const { propertyId, poolId } = await seedPool();
    const year = await store.lockYear(propertyId, 2025);
    const base = {
      propertyId,
      reconciliationYearId: year.id,
      year: 2025,
      poolId,
    };

    await expect(
      store.saveBillOverride({
        ...base,
        id: randomUUID(),
        amountCents: -1,
        note: "Bill",
      }),
    ).rejects.toThrow();
    await expect(
      store.saveBillOverride({
        ...base,
        id: randomUUID(),
        amountCents: 1,
        note: "   ",
      }),
    ).rejects.toThrow();
  });
});
