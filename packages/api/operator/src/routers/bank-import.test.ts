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

function qbo(
  transactions: [string, string, string, string][],
  acctId = "9900001234",
): string {
  return [
    "OFXHEADER:100 DATA:OFXSGML VERSION:102 ENCODING:USASCII CHARSET:1252 ",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF>",
    `<BANKACCTFROM><BANKID>000000000</BANKID><ACCTID>${acctId}</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>`,
    "<BANKTRANLIST><DTSTART>20251201120000.000[0:GMT]</DTSTART><DTEND>20260131120000.000[0:GMT]</DTEND>",
    ...transactions.map(
      ([date, name, amount, fitId]) =>
        `<STMTTRN><TRNTYPE>OTHER</TRNTYPE><DTPOSTED>${date}120000.000[0:GMT]</DTPOSTED><TRNAMT>${amount}</TRNAMT><FITID>${fitId}</FITID><NAME>${name}</NAME></STMTTRN>`,
    ),
    "</BANKTRANLIST><LEDGERBAL><BALAMT>9876.54</BALAMT><DTASOF>20260131120000.000[0:GMT]</DTASOF></LEDGERBAL>",
    "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("");
}

const QBO = qbo([
  ["20251230", "OLD CHECK", "-1.00", "F0"],
  ["20260102", "Mobile Check Deposit", "3654.82", "F1"],
  ["20260105", "SERVICE FEE", "-25.00", "F2"],
  ["20260105", "SERVICE FEE", "-25.00", "F3"],
]);

const WITH_TOTAL = `${CSV}Total,,3484.82,\nEnd of statement,,,\n`;

type Caller = Awaited<
  ReturnType<ReturnType<typeof createTestApp>["callerFor"]>
>;

async function previewCsv(
  caller: Caller,
  input: Parameters<Caller["bankImport"]["preview"]>[0],
) {
  const preview = await caller.bankImport.preview(input);
  if (preview.format !== "csv") throw new Error("Expected a CSV preview");
  return preview;
}

describe("bankImport procedures", () => {
  it("detects the header row below preamble lines before a mapping exists", async () => {
    const caller = await createTestApp().callerFor();

    const preview = await previewCsv(caller, { fileText: CSV });

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

    const preview = await previewCsv(caller, {
      fileText: CSV,
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
      fileText: CSV,
      fileName: "jan.csv",
      mapping: MAPPING,
    });
    expect(first.insertedCount).toBe(4);
    expect(first.beforeTrackingStartCount).toBe(1);
    expect(first.firstPostedOn).toBe("2026-01-02");
    expect(first.lastPostedOn).toBe("2026-01-05");
    expect(await caller.bankImport.getMapping()).toEqual(MAPPING);

    const preview = await previewCsv(caller, { fileText: CSV });
    expect(preview.headerRow).toBe(4);
    expect(preview.counts?.duplicates).toBe(4);

    const second = await caller.bankImport.commit({
      fileText: CSV,
      fileName: "jan.csv",
      mapping: MAPPING,
    });
    expect(second.insertedCount).toBe(0);
    expect(second.duplicateCount).toBe(4);
    expect(app.billing.transactions.size).toBe(4);

    const batches = await caller.bankImport.listBatches();
    expect(batches.map((b) => b.insertedCount).sort()).toEqual([0, 4]);
  });

  it("does not double rows when the id column changes between imports", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    const withId: CsvMapping = { ...MAPPING, idColumn: "Id" };
    const file = [
      "Date,Description,Amount,Id",
      "1/5/2026,SERVICE FEE,-25.00,T1",
      "1/5/2026,SERVICE FEE,-25.00,T2",
      "",
    ].join("\n");

    const first = await caller.bankImport.commit({
      fileText: file,
      fileName: "jan.csv",
      mapping: MAPPING,
    });
    expect(first.insertedCount).toBe(2);

    const second = await caller.bankImport.commit({
      fileText: `${file}1/6/2026,RENT,100.00,T3\n`,
      fileName: "jan.csv",
      mapping: withId,
    });
    expect(second.insertedCount).toBe(1);
    expect(second.duplicateCount).toBe(2);

    const third = await caller.bankImport.commit({
      fileText: `${file}1/6/2026,RENT,100.00,T3\n`,
      fileName: "jan.csv",
      mapping: MAPPING,
    });
    expect(third.insertedCount).toBe(0);
    expect(app.billing.transactions.size).toBe(3);
  });

  it("rejects a commit until every error row is skipped", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const preview = await previewCsv(caller, {
      fileText: WITH_TOTAL,
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
          fileText: WITH_TOTAL,
          fileName: "jan.csv",
          mapping: MAPPING,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(app.billing.transactions.size).toBe(0);
    expect(app.billing.importBatches.size).toBe(0);

    const batch = await caller.bankImport.commit({
      fileText: WITH_TOTAL,
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
      fileText: CSV,
      fileName: "jan.csv",
      mapping: MAPPING,
    });

    const preview = await previewCsv(caller, {
      fileText: "Posted,Memo,Value\n1/2/2026,RENT,10.00",
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
      fileText: CSV,
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

    expect(await codeOf(previewCsv(caller, { fileText: CSV }))).toBe(
      "BAD_REQUEST",
    );
    expect(
      await codeOf(
        caller.bankImport.commit({
          fileText: CSV,
          fileName: "jan.csv",
          mapping: MAPPING,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects a file with a broken quote from preview and commit", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    const broken =
      'Date,Description,Amount\n1/2/2026,"BAD "QUOTE" CO,100.00\n1/3/2026,RENT,200.00\n';

    await expect(
      previewCsv(caller, { fileText: broken, mapping: MAPPING }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Row 2 has a quote mark") as string,
    });
    await expect(
      caller.bankImport.commit({
        fileText: broken,
        fileName: "jan.csv",
        mapping: MAPPING,
        skipRows: [2],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Row 2 has a quote mark") as string,
    });
    expect(app.billing.importBatches.size).toBe(0);
  });

  it("reports a header row with a mapped column name more than once", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    const csvText = "Date,Description,Amount,Amount\n1/2/2026,RENT,,10.00\n";

    const preview = await previewCsv(caller, {
      fileText: csvText,
      mapping: MAPPING,
    });
    expect(preview.mappingError).toBe(
      'Row 1 has more than one column named "Amount"',
    );
    expect(preview.counts).toBeNull();
    expect(
      await codeOf(
        caller.bankImport.commit({
          fileText: csvText,
          fileName: "jan.csv",
          mapping: MAPPING,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(app.billing.importBatches.size).toBe(0);
  });

  it("rejects a header row past the end of the file", async () => {
    const caller = await createTestApp().callerFor();

    expect(
      await codeOf(previewCsv(caller, { fileText: CSV, headerRow: 99 })),
    ).toBe("BAD_REQUEST");
  });
  it("previews a QuickBooks file without a mapping or header row", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const preview = await caller.bankImport.preview({ fileText: QBO });

    if (preview.format !== "ofx") throw new Error("Expected an OFX preview");
    expect(preview.account).toEqual({
      last4: "1234",
      startOn: "2025-12-01",
      endOn: "2026-01-31",
      ledgerBalance: { amountCents: 987_654, asOf: "2026-01-31" },
      warning: null,
    });
    expect(preview.counts).toEqual({
      rows: 4,
      transactions: 3,
      toInsert: 3,
      duplicates: 0,
      beforeTrackingStart: 1,
      zeroAmount: 0,
      notTransaction: 0,
      errors: 0,
    });
    expect(preview.parsedRows[1]).toEqual({
      rowNumber: 2,
      postedOn: "2026-01-02",
      description: "Mobile Check Deposit",
      amountCents: 365_482,
      externalId: "F1",
      status: "new",
    });
    expect(app.billing.transactions.size).toBe(0);
  });

  it("commits a QuickBooks file once without saving a mapping", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    await caller.bankImport.commit({
      fileText: CSV,
      fileName: "dec.csv",
      mapping: MAPPING,
    });

    const first = await caller.bankImport.commit({
      fileText: QBO,
      fileName: "jan.qbo",
    });
    expect(first.format).toBe("ofx");
    expect(first.accountLast4).toBe("1234");
    expect(first.insertedCount).toBe(1);
    expect(first.duplicateCount).toBe(2);

    const overlap = await caller.bankImport.commit({
      fileText: qbo([
        ["20260105", "SERVICE FEE", "-25.00", "F3"],
        ["20260201", "Mobile Check Deposit", "3654.82", "F4"],
      ]),
      fileName: "feb.qbo",
    });
    expect(overlap.insertedCount).toBe(1);
    expect(overlap.duplicateCount).toBe(1);

    const again = await caller.bankImport.commit({
      fileText: QBO,
      fileName: "jan.qbo",
      format: "ofx",
    });
    expect(again.insertedCount).toBe(0);
    expect(app.billing.transactions.size).toBe(6);
    expect(await caller.bankImport.getMapping()).toEqual(MAPPING);

    const batches = await caller.bankImport.listBatches();
    expect(batches.map((b) => b.format).sort()).toEqual([
      "csv",
      "ofx",
      "ofx",
      "ofx",
    ]);
  });

  it("warns when a QuickBooks file is for a different account", async () => {
    const caller = await createTestApp().callerFor();
    await caller.bankImport.commit({ fileText: QBO, fileName: "jan.qbo" });

    const same = await caller.bankImport.preview({ fileText: QBO });
    const other = await caller.bankImport.preview({
      fileText: qbo([["20260102", "RENT", "10.00", "X1"]], "5550009999"),
    });

    expect(same.format === "ofx" && same.account.warning).toBeNull();
    expect(other.format === "ofx" && other.account.warning).toBe(
      "This file is for the account ending 9999, but earlier QuickBooks files were for the account ending 1234. Check that you downloaded the right account.",
    );
  });

  it("rejects a QuickBooks commit until every error row is skipped", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    const file = qbo([
      ["20260102", "RENT", "10.00", "F1"],
      ["20260103", "FEE", "abc", "F2"],
    ]);

    const preview = await caller.bankImport.preview({ fileText: file });
    expect(preview.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        message: '"abc" is not an amount',
      }),
    ]);
    await expect(
      caller.bankImport.commit({ fileText: file, fileName: "jan.qbo" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Skip row 2" });

    const batch = await caller.bankImport.commit({
      fileText: file,
      fileName: "jan.qbo",
      skipRows: [2],
    });
    expect(batch.insertedCount).toBe(1);
    expect(batch.skippedRows).toEqual([2]);
  });

  it("rejects a file that is not the format asked for", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    expect(
      await codeOf(caller.bankImport.preview({ fileText: CSV, format: "ofx" })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.bankImport.commit({ fileText: CSV, fileName: "jan.csv" }),
      ),
    ).toBe("BAD_REQUEST");
    expect(app.billing.importBatches.size).toBe(0);
  });
});
