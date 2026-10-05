import { describe, expect, it } from "vitest";

import type { CsvMapping } from "@moonship/billing";

import { codeOf, createTestApp } from "../test-setup-stores";

const MAPPING: CsvMapping = {
  dateColumn: "Date",
  dateFormat: "MM/DD/YYYY",
  descriptionColumn: "Description",
  amount: { mode: "signed", column: "Amount", flipSign: false },
  idColumn: null,
};

const CSV = [
  "Business Checking Activity",
  "Account,x1234",
  "",
  "Date,Description,Amount,Balance",
  '1/2/2026,ACH DEP 0102 SUPER-LUCKY LLC,"3,654.82",10000.00',
  "1/5/2026,HOME DEPOT 123,-120.00,9880.00",
  "1/5/2026,SERVICE FEE,-25.00,9855.00",
  "1/5/2026,SERVICE FEE,-25.00,9830.00",
  "12/30/2025,OLD CHECK,-1.00,",
  "",
].join("\n");

const WITH_TOTAL = `${CSV}Total,,3484.82,\nEnd of statement,,,\n`;

describe("bankImport procedures", () => {
  it("detects the header row below preamble lines before a mapping exists", async () => {
    const caller = await createTestApp().callerFor();

    const preview = await caller.bankImport.preview({ csvText: CSV });

    expect(preview.headerRow).toBe(4);
    expect(preview.headers).toEqual([
      "Date",
      "Description",
      "Amount",
      "Balance",
    ]);
    expect(preview.rawRows[0]?.rowNumber).toBe(5);
    expect(preview.mapping).toBeNull();
    expect(preview.counts).toBeNull();
  });

  it("previews counts with a mapping without writing", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const preview = await caller.bankImport.preview({
      csvText: CSV,
      mapping: MAPPING,
    });

    expect(preview.counts).toEqual({
      rows: 5,
      transactions: 4,
      toInsert: 4,
      duplicates: 0,
      beforeTrackingStart: 1,
      zeroAmount: 0,
      notTransaction: 0,
      errors: 0,
    });
    expect(preview.parsedRows[0]).toEqual({
      rowNumber: 5,
      postedOn: "2026-01-02",
      description: "ACH DEP 0102 SUPER-LUCKY LLC",
      amountCents: 365_482,
      externalId: null,
      status: "new",
    });
    expect(preview.parsedRows.at(-1)?.status).toBe("beforeTrackingStart");
    expect(app.billing.transactions.size).toBe(0);
    expect(await caller.bankImport.getMapping()).toBeNull();
  });

  it("commits once, saves the mapping, and inserts nothing the second time", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const first = await caller.bankImport.commit({
      csvText: CSV,
      fileName: "jan.csv",
      mapping: MAPPING,
    });
    expect(first.insertedCount).toBe(4);
    expect(first.beforeTrackingStartCount).toBe(1);
    expect(first.firstPostedOn).toBe("2026-01-02");
    expect(first.lastPostedOn).toBe("2026-01-05");
    expect(await caller.bankImport.getMapping()).toEqual(MAPPING);

    const preview = await caller.bankImport.preview({ csvText: CSV });
    expect(preview.headerRow).toBe(4);
    expect(preview.counts?.duplicates).toBe(4);

    const second = await caller.bankImport.commit({
      csvText: CSV,
      fileName: "jan.csv",
      mapping: MAPPING,
    });
    expect(second.insertedCount).toBe(0);
    expect(second.duplicateCount).toBe(4);
    expect(app.billing.transactions.size).toBe(4);

    const batches = await caller.bankImport.listBatches();
    expect(batches.map((b) => b.insertedCount).sort()).toEqual([0, 4]);
  });

  it("rejects a commit until every error row is skipped", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const preview = await caller.bankImport.preview({
      csvText: WITH_TOTAL,
      mapping: MAPPING,
    });
    expect(preview.errors).toEqual([
      {
        rowNumber: 10,
        cells: ["Total", "", "3484.82", ""],
        message: '"Total" is not a MM/DD/YYYY date',
      },
    ]);
    expect(preview.notTransactionRows.map((r) => r.rowNumber)).toEqual([11]);

    expect(
      await codeOf(
        caller.bankImport.commit({
          csvText: WITH_TOTAL,
          fileName: "jan.csv",
          mapping: MAPPING,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(app.billing.transactions.size).toBe(0);
    expect(app.billing.importBatches.size).toBe(0);

    const batch = await caller.bankImport.commit({
      csvText: WITH_TOTAL,
      fileName: "jan.csv",
      mapping: MAPPING,
      skipRows: [10],
    });
    expect(batch.insertedCount).toBe(4);
    expect(batch.notTransactionCount).toBe(1);
    expect(batch.skippedRows).toEqual([10]);
  });

  it("reports a saved mapping that does not fit the file", async () => {
    const caller = await createTestApp().callerFor();
    await caller.bankImport.commit({
      csvText: CSV,
      fileName: "jan.csv",
      mapping: MAPPING,
    });

    const preview = await caller.bankImport.preview({
      csvText: "Posted,Memo,Value\n1/2/2026,RENT,10.00",
    });

    expect(preview.mappingError).toBe(
      "No row in the file has every matched column",
    );
    expect(preview.headerRow).toBe(1);
    expect(preview.headers).toEqual(["Posted", "Memo", "Value"]);
    expect(preview.counts).toBeNull();
  });

  it("removes a batch only when none of its rows is sorted", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    const batch = await caller.bankImport.commit({
      csvText: CSV,
      fileName: "jan.csv",
      mapping: MAPPING,
    });
    const repairs = (await caller.category.list()).find(
      (c) => c.name === "Repairs",
    );
    const fee = [...app.billing.transactions.values()].find(
      (t) => t.description === "HOME DEPOT 123",
    );
    if (!repairs || !fee) throw new Error("missing fixture");
    await caller.transaction.allocate({
      id: fee.id,
      lines: [{ categoryId: repairs.id, amountCents: -12_000 }],
    });

    expect(await codeOf(caller.bankImport.removeBatch({ id: batch.id }))).toBe(
      "CONFLICT",
    );
    expect((await caller.bankImport.listBatches())[0]?.sortedCount).toBe(1);

    await caller.transaction.unsort({ id: fee.id });
    expect(await caller.bankImport.removeBatch({ id: batch.id })).toEqual({
      ok: true,
    });
    expect(app.billing.transactions.size).toBe(0);
    expect(await caller.bankImport.listBatches()).toEqual([]);
    expect(await codeOf(caller.bankImport.removeBatch({ id: batch.id }))).toBe(
      "NOT_FOUND",
    );
  });

  it("asks for a tracking start date before importing", async () => {
    const caller = await createTestApp({ trackingStartDate: null }).callerFor();

    expect(await codeOf(caller.bankImport.preview({ csvText: CSV }))).toBe(
      "BAD_REQUEST",
    );
    expect(
      await codeOf(
        caller.bankImport.commit({
          csvText: CSV,
          fileName: "jan.csv",
          mapping: MAPPING,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects a header row past the end of the file", async () => {
    const caller = await createTestApp().callerFor();

    expect(
      await codeOf(caller.bankImport.preview({ csvText: CSV, headerRow: 99 })),
    ).toBe("BAD_REQUEST");
  });
});
