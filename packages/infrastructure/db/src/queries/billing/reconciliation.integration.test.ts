import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type {
  ReconciliationYear,
  RecordedPoolLine,
  StatementData,
  StatementSnapshot,
} from "@moonship/billing";

import { createDb } from "../../client";
import { PGBillingStore } from "../../repositories/billing/billing-store";
import {
  costPools,
  poolBillOverrides,
  reconciliationStatements,
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
        .delete(reconciliationStatements)
        .where(inArray(reconciliationStatements.propertyId, propertyIds));
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

  it("locks an existing year without creating a missing one", async () => {
    const { propertyId } = await seedPool();
    expect(
      await unitOfWork.run((stores) =>
        stores.billing.lockExistingYear(propertyId, 2026),
      ),
    ).toBeNull();
    expect(await queries.listReconciliationYears(propertyId)).toEqual([]);

    const created = await store.lockYear(propertyId, 2026);
    const locked = await unitOfWork.run((stores) =>
      stores.billing.lockExistingYear(propertyId, 2026),
    );
    expect(locked).toEqual(created);
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

  function statementData(): StatementData {
    const address = {
      street1: "1 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
      country: "US",
    };
    return {
      year: 2025,
      letterDate: "2026-01-02",
      property: { name: "Lucky Plaza" },
      owner: {
        name: "Pat Owner",
        title: "Managing Member",
        company: "Lucky Plaza LLC",
        phone: "(555) 010-2000",
        email: "owner@example.com",
      },
      tenant: { businessName: "Super Lucky LLC", mailingAddress: address },
      unit: { label: "A", address, sqft: 2500 },
      buildingSqft: 9350,
      otherPoolAreas: [],
      rows: [
        {
          poolId: randomUUID(),
          name: "CAM",
          poolSqft: 9350,
          actualCents: 1_289_119,
          billOverride: null,
          months: 12,
          partCents: 344_684,
          estimatesCents: 322_332,
          balanceCents: 22_352,
        },
      ],
      trueUpCents: 22_352,
      priorBalanceCents: 41_374,
      priorBalanceAsOf: "2025-12-31",
      balanceOnAccountCents: 63_726,
      continuing: null,
    };
  }

  it("stores one statement snapshot per year and account", async () => {
    const { propertyId } = await seedPool();
    const year = await store.lockYear(propertyId, 2025);
    const accountId = randomUUID();
    const snapshot: StatementSnapshot = {
      id: randomUUID(),
      propertyId,
      reconciliationYearId: year.id,
      year: 2025,
      accountId,
      tenantId: randomUUID(),
      data: statementData(),
      trueUpCents: 22_352,
      balanceOnAccountCents: 63_726,
      pdfStorageKey: `reconciliations/${propertyId}/2025/${accountId}.pdf`,
      createdAt: new Date("2026-01-05T15:00:00Z"),
    };
    expect(await queries.accountHasActivity(propertyId, accountId)).toBe(false);

    expect(await store.insertStatementSnapshot(snapshot)).toEqual(snapshot);
    expect(await queries.listStatementSnapshots(propertyId)).toEqual([
      snapshot,
    ]);
    expect(await queries.listStatementSnapshots(randomUUID())).toEqual([]);
    expect(await queries.accountHasActivity(propertyId, accountId)).toBe(true);

    await expect(
      store.insertStatementSnapshot({ ...snapshot, id: randomUUID() }),
    ).rejects.toThrow();
    expect(await queries.listStatementSnapshots(propertyId)).toHaveLength(1);
  });

  it("stores a recorded year that is listed but does not lock dates", async () => {
    const { propertyId, poolId } = await seedPool();
    const record: ReconciliationYear = {
      id: randomUUID(),
      propertyId,
      year: 2025,
      status: "finalized",
      source: "recorded",
      letterDate: "2026-10-05",
      finalizedAt: new Date("2026-10-05T15:00:00Z"),
    };
    const accountId = randomUUID();
    const snapshot: StatementSnapshot = {
      id: randomUUID(),
      propertyId,
      reconciliationYearId: record.id,
      year: 2025,
      accountId,
      tenantId: randomUUID(),
      data: statementData(),
      trueUpCents: 22_352,
      balanceOnAccountCents: 63_726,
      pdfStorageKey: `reconciliations/${propertyId}/2025/${accountId}.pdf`,
      createdAt: new Date("2026-10-05T15:00:00Z"),
    };
    const line = (
      postedOn: string,
      description: string,
      source: "bank" | "cash",
      costCents: number,
    ): RecordedPoolLine => ({
      id: randomUUID(),
      propertyId,
      reconciliationYearId: record.id,
      year: 2025,
      poolId,
      postedOn,
      description,
      source,
      costCents,
    });
    const lines = [
      line("2025-12-31", "Management fee", "cash", 832_854),
      line("2025-01-24", "Check #1012", "bank", 15_000),
    ];

    await unitOfWork.run((stores) =>
      stores.billing.insertRecordedYear(record, [snapshot], lines),
    );

    expect(await queries.listReconciliationYears(propertyId)).toEqual([record]);
    expect(await queries.listFinalizedYears(propertyId)).toEqual([]);
    expect(await queries.listStatementSnapshots(propertyId)).toEqual([
      snapshot,
    ]);
    expect(await queries.listRecordedPoolLines(propertyId)).toEqual([
      lines[1],
      lines[0],
    ]);
    expect(await queries.listRecordedPoolLines(randomUUID())).toEqual([]);

    await expect(
      unitOfWork.run((stores) =>
        stores.billing.insertRecordedYear(
          { ...record, id: randomUUID() },
          [],
          [],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      store.saveYear({ ...record, status: "draft", finalizedAt: null }),
    ).rejects.toThrow();
    expect(await queries.listRecordedPoolLines(propertyId)).toHaveLength(2);
  });
});
