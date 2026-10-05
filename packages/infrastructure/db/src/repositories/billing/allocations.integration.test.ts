import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { AllocationLine } from "@moonship/billing";

import { createDb } from "../../client";
import { PGBillingQueries } from "../../queries/billing/billing-queries";
import {
  bankAccounts,
  categories,
  importBatches,
  transactionAllocations,
  transactions,
} from "../../schemas/billing/schema";
import { createPGUnitOfWork } from "../../unit-of-work";
import { PGBillingStore } from "./billing-store";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("transaction allocations", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const unitOfWork = createPGUnitOfWork(db);
  const store = new PGBillingStore(db);
  const queries = new PGBillingQueries(db);
  const propertyIds: string[] = [];

  afterAll(async () => {
    if (propertyIds.length > 0) {
      await db
        .delete(transactions)
        .where(inArray(transactions.propertyId, propertyIds));
      await db
        .delete(importBatches)
        .where(inArray(importBatches.propertyId, propertyIds));
      await db
        .delete(bankAccounts)
        .where(inArray(bankAccounts.propertyId, propertyIds));
      await db
        .delete(categories)
        .where(inArray(categories.propertyId, propertyIds));
    }
    await db.$client.end({ timeout: 5 });
  });

  async function setup(amountCents: number) {
    const propertyId = randomUUID();
    propertyIds.push(propertyId);
    const categoryId = randomUUID();
    await store.saveCategory({
      id: categoryId,
      propertyId,
      name: "Repairs",
      kind: "owner_expense",
      poolId: null,
      archivedAt: null,
    });
    const transactionId = randomUUID();
    await unitOfWork.run(async ({ billing }) => {
      const bankAccount = await billing.lockBankAccount(propertyId);
      await billing.insertImportBatch(
        {
          id: randomUUID(),
          propertyId,
          bankAccountId: bankAccount.id,
          fileName: "activity.csv",
          format: "csv",
          accountLast4: null,
          importedAt: new Date(),
          rowCount: 1,
          insertedCount: 1,
          duplicateCount: 0,
          beforeTrackingStartCount: 0,
          notTransactionCount: 0,
          firstPostedOn: "2026-01-05",
          lastPostedOn: "2026-01-05",
        },
        [
          {
            id: transactionId,
            postedOn: "2026-01-05",
            description: "CHECK 101",
            descriptionKey: "check",
            amountCents,
            externalId: null,
            rawRowHash: "hash",
          },
        ],
      );
    });
    return { propertyId, categoryId, transactionId };
  }

  function linesOf(transactionId: string) {
    return db
      .select()
      .from(transactionAllocations)
      .where(eq(transactionAllocations.transactionId, transactionId));
  }

  it("replaces lines atomically", async () => {
    const { propertyId, categoryId, transactionId } = await setup(500_000);
    const accountA = randomUUID();
    const accountB = randomUUID();

    await unitOfWork.run(({ billing }) =>
      billing.replaceAllocations(propertyId, transactionId, [
        { accountId: accountA, categoryId: null, amountCents: 500_000 },
      ]),
    );
    const txn = await unitOfWork.run(({ billing }) =>
      billing.replaceAllocations(propertyId, transactionId, [
        { accountId: accountA, categoryId: null, amountCents: 300_000 },
        { accountId: accountB, categoryId: null, amountCents: 210_000 },
        { accountId: null, categoryId, amountCents: -10_000 },
      ]),
    );

    expect(txn?.lines).toHaveLength(3);
    expect(await linesOf(transactionId)).toHaveLength(3);
    expect(await queries.accountHasActivity(propertyId, accountB)).toBe(true);
    expect(await queries.categoryHasAllocations(propertyId, categoryId)).toBe(
      true,
    );
    expect(await queries.hasTransactions(propertyId)).toBe(true);
  });

  it("leaves the old lines in place when the new lines do not add up", async () => {
    const { propertyId, categoryId, transactionId } = await setup(-12_000);
    await unitOfWork.run(({ billing }) =>
      billing.replaceAllocations(propertyId, transactionId, [
        { accountId: null, categoryId, amountCents: -12_000 },
      ]),
    );

    await expect(
      unitOfWork.run(({ billing }) =>
        billing.replaceAllocations(propertyId, transactionId, [
          { accountId: null, categoryId, amountCents: -11_000 },
        ]),
      ),
    ).rejects.toThrow("add up");

    const lines = await linesOf(transactionId);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.amountCents).toBe(-12_000);
  });

  it("ends two simultaneous allocate calls with one set of lines", async () => {
    const { propertyId, categoryId, transactionId } = await setup(-12_000);
    const lines: AllocationLine[] = [
      { accountId: null, categoryId, amountCents: -7_000 },
      { accountId: null, categoryId, amountCents: -5_000 },
    ];

    await Promise.all([
      unitOfWork.run(({ billing }) =>
        billing.replaceAllocations(propertyId, transactionId, lines),
      ),
      unitOfWork.run(({ billing }) =>
        billing.replaceAllocations(propertyId, transactionId, lines),
      ),
    ]);

    expect(await linesOf(transactionId)).toHaveLength(2);
  });

  it("writes a cash expense and its single line together", async () => {
    const propertyId = randomUUID();
    propertyIds.push(propertyId);
    const categoryId = randomUUID();
    const otherCategoryId = randomUUID();
    for (const [id, name] of [
      [categoryId, "Repairs"],
      [otherCategoryId, "Owner utilities"],
    ] as const) {
      await store.saveCategory({
        id,
        propertyId,
        name,
        kind: "owner_expense",
        poolId: null,
        archivedAt: null,
      });
    }
    const id = randomUUID();

    const created = await unitOfWork.run(({ billing }) =>
      billing.insertCashExpense({
        id,
        propertyId,
        postedOn: "2026-02-03",
        description: "Hardware store",
        amountCents: 4_250,
        categoryId,
      }),
    );
    expect(created.amountCents).toBe(-4_250);
    expect(created.source).toBe("cash");
    expect(created.lines).toEqual([
      { accountId: null, categoryId, amountCents: -4_250 },
    ]);

    const updated = await unitOfWork.run(({ billing }) =>
      billing.updateCashExpense({
        id,
        propertyId,
        postedOn: "2026-02-04",
        description: "Light bulbs",
        amountCents: 1_000,
        categoryId: otherCategoryId,
      }),
    );
    expect(updated?.postedOn).toBe("2026-02-04");
    expect(updated?.lines).toEqual([
      { accountId: null, categoryId: otherCategoryId, amountCents: -1_000 },
    ]);

    expect(await store.deleteCashExpense(propertyId, id)).toBe(true);
    expect(await linesOf(id)).toHaveLength(0);
  });
});
