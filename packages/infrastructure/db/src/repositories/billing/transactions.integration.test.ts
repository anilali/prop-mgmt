import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { CsvMapping } from "@moonship/billing";
import {
  commitImport,
  commitOfxImport,
  parseOfx,
  removeImportBatch,
} from "@moonship/billing";

import type { PGBillingStore } from "./billing-store";
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

function ofx(...transactions: [string, string, string, string][]): string {
  return [
    "OFXHEADER:100 DATA:OFXSGML VERSION:102 ENCODING:USASCII CHARSET:1252 ",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD",
    "<BANKACCTFROM><BANKID>000000000<ACCTID>9900004321<ACCTTYPE>CHECKING</BANKACCTFROM>",
    "<BANKTRANLIST><DTSTART>20260101<DTEND>20260131",
    ...transactions.map(
      ([date, name, amount, fitId]) =>
        `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${date}120000.000[0:GMT]<TRNAMT>${amount}<FITID>${fitId}<NAME>${name}</STMTTRN>`,
    ),
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
}

function csvWithIds(...lines: string[]): string[][] {
  return ["Date,Description,Amount,Id", ...lines].map((line) =>
    line.split(","),
  );
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

  function commitIn(
    billing: PGBillingStore,
    propertyId: string,
    rows: string[][],
    csvMapping: CsvMapping,
  ) {
    return commitImport(billing, {
      propertyId,
      fileName: "activity.csv",
      rows,
      mapping: csvMapping,
      trackingStart: "2026-01-01",
      importedAt: new Date(),
      newId: randomUUID,
      hashRow: (cells) =>
        createHash("sha256").update(cells.join("\u001f")).digest("hex"),
    });
  }

  async function commit(
    propertyId: string,
    rows: string[][],
    csvMapping: CsvMapping = mapping,
  ) {
    const { batch } = await unitOfWork.run(({ billing }) =>
      commitIn(billing, propertyId, rows, csvMapping),
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

  it("inserts once in total when the same file is committed twice at the same time", async () => {
    const propertyId = newProperty();
    const file = csv(
      "1/5/2026,FEE,-25.00",
      "1/5/2026,FEE,-25.00",
      "1/6/2026,RENT,3654.82",
    );

    const batches = await Promise.all([
      commit(propertyId, file),
      commit(propertyId, file),
    ]);

    expect(batches.map((b) => b.insertedCount).sort()).toEqual([0, 3]);
    expect(await stored(propertyId)).toHaveLength(3);
    expect(await queries.listImportBatches(propertyId)).toHaveLength(2);
  });

  it("leaves no batch or rows when a commit fails", async () => {
    const propertyId = newProperty();

    await expect(
      unitOfWork.run(async ({ billing }) => {
        await commitIn(
          billing,
          propertyId,
          csv("1/5/2026,FEE,-25.00"),
          mapping,
        );
        throw new Error("failed after insert");
      }),
    ).rejects.toThrow("failed after insert");

    expect(await stored(propertyId)).toHaveLength(0);
    expect(await queries.listImportBatches(propertyId)).toHaveLength(0);
  });

  it("does not double rows when the id column is added after imports without one", async () => {
    const propertyId = newProperty();
    const withId: CsvMapping = { ...mapping, idColumn: "Id" };
    const january = [
      "1/5/2026,FEE,-25.00,T1",
      "1/5/2026,FEE,-25.00,T2",
      "1/6/2026,RENT,3654.82,T3",
    ];

    expect(
      (await commit(propertyId, csvWithIds(...january))).insertedCount,
    ).toBe(3);
    const overlap = await commit(
      propertyId,
      csvWithIds(...january, "1/5/2026,FEE,-25.00,T4"),
      withId,
    );

    expect(overlap.insertedCount).toBe(1);
    expect(overlap.duplicateCount).toBe(3);
    expect(await stored(propertyId)).toHaveLength(4);
  });

  it("does not double rows when the id column is removed after imports with one", async () => {
    const propertyId = newProperty();
    const withId: CsvMapping = { ...mapping, idColumn: "Id" };
    const january = [
      "1/5/2026,FEE,-25.00,T1",
      "1/5/2026,FEE,-25.00,T2",
      "1/6/2026,RENT,3654.82,T3",
    ];

    expect(
      (await commit(propertyId, csvWithIds(...january), withId)).insertedCount,
    ).toBe(3);
    const overlap = await commit(
      propertyId,
      csvWithIds(...january, "1/5/2026,FEE,-25.00,T4"),
    );

    expect(overlap.insertedCount).toBe(1);
    expect(overlap.duplicateCount).toBe(3);
    expect(await stored(propertyId)).toHaveLength(4);
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
  it("imports a QuickBooks file once by its transaction ids", async () => {
    const propertyId = newProperty();
    const commitOfx = (text: string) =>
      unitOfWork.run(({ billing }) =>
        commitOfxImport(billing, {
          propertyId,
          fileName: "activity.qbo",
          statement: parseOfx(text),
          trackingStart: "2026-01-01",
          importedAt: new Date(),
          newId: randomUUID,
          hashRow: (cells) =>
            createHash("sha256").update(cells.join("\u001f")).digest("hex"),
        }),
      );
    const january = ofx(
      ["20251231", "OLD FEE", "-5.00", "OFX-T0"],
      ["20260105", "Mobile Check Deposit", "2500.00", "OFX-T1"],
      ["20260106", "SERVICE FEE", "-25.00", "OFX-T2"],
    );

    const first = await commitOfx(january);
    expect(first.batch.insertedCount).toBe(2);
    expect(first.batch.beforeTrackingStartCount).toBe(1);

    const overlap = await commitOfx(
      ofx(
        ["20260106", "SERVICE FEE", "-25.00", "OFX-T2"],
        ["20260106", "SERVICE FEE", "-25.00", "OFX-T3"],
      ),
    );
    expect(overlap.batch.insertedCount).toBe(1);
    expect(overlap.batch.duplicateCount).toBe(1);
    expect((await commitOfx(january)).batch.insertedCount).toBe(0);

    const rows = await stored(propertyId);
    expect(rows.map((row) => row.externalId).sort()).toEqual([
      "OFX-T1",
      "OFX-T2",
      "OFX-T3",
    ]);
    const batches = await queries.listImportBatches(propertyId);
    expect(batches).toHaveLength(3);
    expect(
      batches.every((b) => b.format === "ofx" && b.accountLast4 === "4321"),
    ).toBe(true);
    expect((await queries.getBankAccount(propertyId))?.csvMapping).toBeNull();
  });
});
