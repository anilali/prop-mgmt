import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { CsvMapping } from "@moonship/billing";
import { commitImport, removeImportBatch } from "@moonship/billing";

import { createDb } from "../../client";
import { PGBillingQueries } from "../../queries/billing/billing-queries";
import {
  bankAccounts,
  importBatches,
  transactions,
} from "../../schemas/billing/schema";
import { createPGUnitOfWork } from "../../unit-of-work";

const databaseUrl = process.env.POSTGRES_URL;

const mapping: CsvMapping = {
  dateColumn: "Date",
  dateFormat: "MM/DD/YYYY",
  descriptionColumn: "Description",
  amount: { mode: "signed", column: "Amount", flipSign: false },
  idColumn: null,
};

function csv(...lines: string[]): string[][] {
  return ["Date,Description,Amount", ...lines].map((line) => line.split(","));
}

describe.skipIf(!databaseUrl)("bank transaction import", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const unitOfWork = createPGUnitOfWork(db);
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
    }
    await db.$client.end({ timeout: 5 });
  });

  function newProperty(): string {
    const propertyId = randomUUID();
    propertyIds.push(propertyId);
    return propertyId;
  }

  async function commit(propertyId: string, rows: string[][]) {
    const { batch } = await unitOfWork.run(({ billing }) =>
      commitImport(billing, {
        propertyId,
        fileName: "activity.csv",
        rows,
        mapping,
        trackingStart: "2026-01-01",
        importedAt: new Date(),
        newId: randomUUID,
        hashRow: (cells) =>
          createHash("sha256").update(cells.join("\u001f")).digest("hex"),
      }),
    );
    return batch;
  }

  function stored(propertyId: string) {
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.propertyId, propertyId));
  }

  it("inserts nothing when the same CSV is committed twice", async () => {
    const propertyId = newProperty();
    const file = csv(
      "1/5/2026,FEE,-25.00",
      "1/6/2026,ACH DEP SUPER LUCKY,3654.82",
    );

    expect((await commit(propertyId, file)).insertedCount).toBe(2);
    const second = await commit(propertyId, file);
    expect(second.insertedCount).toBe(0);
    expect(second.duplicateCount).toBe(2);
    expect(await stored(propertyId)).toHaveLength(2);
    expect((await queries.getBankAccount(propertyId))?.csvMapping).toEqual(
      mapping,
    );
  });

  it("inserts only new rows from an overlapping CSV", async () => {
    const propertyId = newProperty();
    await commit(
      propertyId,
      csv("1/30/2026,FEE,-25.00", "1/31/2026,RENT,3654.82"),
    );

    const second = await commit(
      propertyId,
      csv("1/31/2026,RENT,3654.82", "2/2/2026,RENT,3654.82"),
    );

    expect(second.insertedCount).toBe(1);
    expect(await stored(propertyId)).toHaveLength(3);
  });

  it("stores two equal rows in one day once each", async () => {
    const propertyId = newProperty();
    const file = csv("1/5/2026,FEE,-25.00", "1/5/2026,FEE,-25.00");

    expect((await commit(propertyId, file)).insertedCount).toBe(2);
    expect((await commit(propertyId, file)).insertedCount).toBe(0);
    expect(await stored(propertyId)).toHaveLength(2);
  });

  it("brings rows back when a removed batch is committed again", async () => {
    const propertyId = newProperty();
    const file = csv("1/5/2026,FEE,-25.00", "1/6/2026,RENT,3654.82");
    const batch = await commit(propertyId, file);

    expect(
      await unitOfWork.run(({ billing }) =>
        removeImportBatch(billing, propertyId, batch.id),
      ),
    ).toBe("removed");
    expect(await stored(propertyId)).toHaveLength(0);
    expect(await queries.listImportBatches(propertyId)).toHaveLength(0);

    expect((await commit(propertyId, file)).insertedCount).toBe(2);
    expect(await stored(propertyId)).toHaveLength(2);
  });

  it("keeps a batch that has a sorted row", async () => {
    const propertyId = newProperty();
    const batch = await commit(propertyId, csv("1/6/2026,RENT,3654.82"));
    const [row] = await stored(propertyId);
    if (!row) throw new Error("missing row");
    await unitOfWork.run(({ billing }) =>
      billing.replaceAllocations(propertyId, row.id, [
        { accountId: randomUUID(), categoryId: null, amountCents: 365_482 },
      ]),
    );

    expect(
      await unitOfWork.run(({ billing }) =>
        removeImportBatch(billing, propertyId, batch.id),
      ),
    ).toBe("sorted");
    expect(await stored(propertyId)).toHaveLength(1);
    expect((await queries.listImportBatches(propertyId))[0]?.sortedCount).toBe(
      1,
    );
  });
});
