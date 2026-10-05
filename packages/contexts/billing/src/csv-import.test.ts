import { describe, expect, it } from "vitest";

import type {
  CsvTransactionRow,
  DedupeState,
  StoredKeyCount,
} from "./csv-import";
import type { CsvMapping } from "./types";
import {
  dedupeKey,
  dedupeRange,
  findHeaderRow,
  headerProblem,
  importCandidates,
  parseCsvDate,
  parseRows,
  planImport,
  unskippedErrors,
} from "./csv-import";

function rows(text: string): string[][] {
  return text.split("\n").map((line) => line.split(","));
}

const signed: CsvMapping = {
  dateColumn: "Date",
  dateFormat: "MM/DD/YYYY",
  descriptionColumn: "Description",
  amount: { mode: "signed", column: "Amount", flipSign: false },
  idColumn: null,
};

const EMPTY: DedupeState = { externalIds: new Map(), counts: new Map() };

function stored(...batches: CsvTransactionRow[][]): DedupeState {
  const externalIds = new Map<string, string>();
  const counts = new Map<string, StoredKeyCount>();
  for (const row of batches.flat()) {
    const key = dedupeKey(row);
    const count = counts.get(key) ?? { total: 0, withoutId: 0 };
    count.total += 1;
    if (row.externalId === null) count.withoutId += 1;
    counts.set(key, count);
    if (row.externalId !== null) externalIds.set(row.externalId, key);
  }
  return { externalIds, counts };
}

function plan(
  text: string,
  options: {
    mapping?: CsvMapping;
    state?: DedupeState;
    skipRows?: number[];
    trackingStart?: string;
  } = {},
) {
  const mapping = options.mapping ?? signed;
  const parsed = rows(text);
  const headerRow = findHeaderRow(parsed, mapping);
  if (headerRow === null) throw new Error("no header");
  return planImport(parseRows(parsed, headerRow, mapping), {
    trackingStart: options.trackingStart ?? "2026-01-01",
    stored: options.state ?? EMPTY,
    skipRows: options.skipRows,
  });
}

describe("findHeaderRow", () => {
  it("finds the first row with three cells below preamble lines on first import", () => {
    const file = rows(
      [
        "Account activity",
        "Business checking,x1234",
        "",
        "Date,Description,Amount,Balance",
        "1/2/2026,ACH DEP,100.00,500.00",
      ].join("\n"),
    );

    expect(findHeaderRow(file, null)).toBe(4);
  });

  it("finds the first row with every mapped column once a mapping exists", () => {
    const file = rows(
      [
        "Statement,for,January,2026",
        "Posted,Memo,Value",
        "Date,Description,Amount",
        "1/2/2026,ACH DEP,100.00",
      ].join("\n"),
    );

    expect(findHeaderRow(file, null)).toBe(1);
    expect(findHeaderRow(file, signed)).toBe(3);
    expect(
      findHeaderRow(file, { ...signed, descriptionColumn: "Payee" }),
    ).toBeNull();
  });
});

describe("parseCsvDate", () => {
  it("accepts one- or two-digit months and days", () => {
    expect(parseCsvDate("1/5/2026", "MM/DD/YYYY")).toBe("2026-01-05");
    expect(parseCsvDate("01/05/2026", "MM/DD/YYYY")).toBe("2026-01-05");
    expect(parseCsvDate("1/5/2026", "DD/MM/YYYY")).toBe("2026-05-01");
    expect(parseCsvDate("2026-1-5", "YYYY-MM-DD")).toBe("2026-01-05");
    expect(parseCsvDate(" 2026-01-05 ", "YYYY-MM-DD")).toBe("2026-01-05");
  });

  it("rejects dates that do not exist, two-digit years, and other formats", () => {
    expect(parseCsvDate("2/30/2026", "MM/DD/YYYY")).toBeNull();
    expect(parseCsvDate("1/5/26", "MM/DD/YYYY")).toBeNull();
    expect(parseCsvDate("13/1/2026", "MM/DD/YYYY")).toBeNull();
    expect(parseCsvDate("2026-01-05", "MM/DD/YYYY")).toBeNull();
    expect(parseCsvDate("2/29/2024", "MM/DD/YYYY")).toBe("2024-02-29");
  });
});

describe("parseRows", () => {
  it("reads a signed amount and flips it when asked", () => {
    const parsed = [
      ["Date", "Description", "Amount"],
      ["1/2/2026", "  ACH DEP  ", "1,000.00"],
      ["1/3/2026", "CHECK 101", "(25.50)"],
    ];

    const plain = parseRows(parsed, 1, signed);
    expect(plain).toMatchObject([
      {
        kind: "transaction",
        rowNumber: 2,
        postedOn: "2026-01-02",
        description: "ACH DEP",
        descriptionKey: "ach dep",
        amountCents: 100_000,
      },
      { kind: "transaction", rowNumber: 3, amountCents: -2550 },
    ]);

    const flipped = parseRows(parsed, 1, {
      ...signed,
      amount: { mode: "signed", column: "Amount", flipSign: true },
    });
    expect(
      flipped.map((r) => r.kind === "transaction" && r.amountCents),
    ).toEqual([-100_000, 2550]);
  });

  it("reads debit and credit columns as absolute values with blank as 0", () => {
    const mapping: CsvMapping = {
      ...signed,
      amount: {
        mode: "debitCredit",
        debitColumn: "Debit",
        creditColumn: "Credit",
      },
    };
    const parsed = rows(
      [
        "Date,Description,Debit,Credit",
        "1/2/2026,RENT,,3654.82",
        "1/3/2026,HOME DEPOT,-120.00,",
        "1/4/2026,FEE,25.00,",
      ].join("\n"),
    );

    expect(
      parseRows(parsed, 1, mapping).map(
        (r) => r.kind === "transaction" && r.amountCents,
      ),
    ).toEqual([365_482, -12_000, -2500]);
  });

  it("reads parenthesized and dollar-sign amounts", () => {
    const parsed = [
      ["Date", "Description", "Amount"],
      ["1/2/2026", "CHECK 101", "(1,234.56)"],
      ["1/3/2026", "ACH DEP", "$1,234.56"],
      ["1/4/2026", "FEE", "-$25.00"],
      ["1/5/2026", "REFUND", "($5.00)"],
    ];

    expect(
      parseRows(parsed, 1, signed).map(
        (r) => r.kind === "transaction" && r.amountCents,
      ),
    ).toEqual([-123_456, 123_456, -2500, -500]);
  });

  it("nets debit and credit when both are filled", () => {
    const mapping: CsvMapping = {
      ...signed,
      amount: {
        mode: "debitCredit",
        debitColumn: "Debit",
        creditColumn: "Credit",
      },
    };
    const parsed = rows(
      [
        "Date,Description,Debit,Credit",
        "1/2/2026,NET,10.00,25.00",
        "1/3/2026,NET OUT,-30.00,5.00",
        "1/4/2026,EVEN,5.00,5.00",
      ].join("\n"),
    );

    expect(
      parseRows(parsed, 1, mapping).map(
        (r) => r.kind === "transaction" && r.amountCents,
      ),
    ).toEqual([1500, -2500, 0]);
  });

  it("makes a row with one bad and one good debit or credit cell an error", () => {
    const mapping: CsvMapping = {
      ...signed,
      amount: {
        mode: "debitCredit",
        debitColumn: "Debit",
        creditColumn: "Credit",
      },
    };
    const parsed = rows(
      [
        "Date,Description,Debit,Credit",
        "Pending,A,n/a,100.00",
        "1/3/2026,B,n/a,100.00",
        "Pending,C,n/a,",
        "Pending,D,n/a,n/a",
      ].join("\n"),
    );

    expect(
      parseRows(parsed, 1, mapping).map((o) => [o.rowNumber, o.kind]),
    ).toEqual([
      [2, "error"],
      [3, "error"],
      [4, "notTransaction"],
      [5, "notTransaction"],
    ]);
  });

  it("makes an amount beyond the storable range an error", () => {
    const parsed = rows(
      [
        "Date,Description,Amount",
        "1/2/2026,MAX,21474836.47",
        "1/2/2026,BIG,21474836.48",
        "1/2/2026,BIG OUT,-21474836.48",
        "Total,,99999999.00",
      ].join("\n"),
    );

    const outcomes = parseRows(parsed, 1, signed);
    expect(outcomes.map((o) => [o.rowNumber, o.kind])).toEqual([
      [2, "transaction"],
      [3, "error"],
      [4, "error"],
      [5, "error"],
    ]);
    expect(outcomes[1]).toMatchObject({
      message: '"21474836.48" is larger than $21,474,836.47',
    });
  });

  it("sorts rows into transactions, errors, and not-a-transaction rows", () => {
    const parsed = rows(
      [
        "Date,Description,Amount",
        "1/5/2026,A,10.00",
        "01/05/2026,B,10.00",
        "2/30/2026,C,10.00",
        "1/5/26,D,10.00",
        "1/6/2026,E,abc",
        "1/7/2026,F,",
        ",,",
        "Total,,1234.00",
        "Ending balance,,",
        "Generated by the bank,,n/a",
      ].join("\n"),
    );

    const outcomes = parseRows(parsed, 1, signed);

    expect(outcomes.map((o) => [o.rowNumber, o.kind])).toEqual([
      [2, "transaction"],
      [3, "transaction"],
      [4, "error"],
      [5, "error"],
      [6, "error"],
      [7, "error"],
      [9, "error"],
      [10, "notTransaction"],
      [11, "notTransaction"],
    ]);
    const [a, b] = outcomes;
    expect(a?.kind === "transaction" && a.postedOn).toBe("2026-01-05");
    expect(b?.kind === "transaction" && b.postedOn).toBe("2026-01-05");
  });

  it("rejects a header row that lacks a mapped column", () => {
    const parsed = rows("Date,Memo,Amount\n1/5/2026,A,10.00");

    expect(() => parseRows(parsed, 1, signed)).toThrow(
      'Row 1 has no column named "Description"',
    );
    expect(() => parseRows(parsed, 9, signed)).toThrow(
      "Row 9 is not in the file",
    );
  });

  it("rejects a header row with a mapped column name more than once", () => {
    const parsed = rows("Date,Description,Amount,Amount\n1/5/2026,A,,10.00");

    expect(() => parseRows(parsed, 1, signed)).toThrow(
      'Row 1 has more than one column named "Amount"',
    );
    expect(headerProblem(["Date", "Description", "Amount"], 1, signed)).toBe(
      null,
    );
    expect(
      headerProblem(["Date", "Date", "Description", "Amount"], 4, signed),
    ).toBe('Row 4 has more than one column named "Date"');
    expect(
      headerProblem(["Date", "Description", "Amount", "Amount"], 1, {
        ...signed,
        idColumn: "Ref",
      }),
    ).toBe('Row 1 has no column named "Ref"');
  });
});

describe("planImport", () => {
  it("blocks an error row until it is skipped", () => {
    const file = [
      "Date,Description,Amount",
      "1/5/2026,A,10.00",
      "Total,,10.00",
      "End of statement,,",
    ].join("\n");

    const first = plan(file);
    expect(unskippedErrors(first).map((e) => e.rowNumber)).toEqual([3]);
    expect(first.notTransaction.map((r) => r.rowNumber)).toEqual([4]);

    const second = plan(file, { skipRows: [3] });
    expect(unskippedErrors(second)).toEqual([]);
    expect(second.errors).toMatchObject([{ rowNumber: 3, skipped: true }]);
    expect(second.toInsert).toHaveLength(1);
  });

  it("skips zero amounts and counts rows before tracking start", () => {
    const result = plan(
      [
        "Date,Description,Amount",
        "12/31/2025,OLD,10.00",
        "1/1/2026,NEW,10.00",
        "1/2/2026,ZERO,0.00",
      ].join("\n"),
    );

    expect(result.beforeTrackingStart.map((r) => r.description)).toEqual([
      "OLD",
    ]);
    expect(result.zeroAmount.map((r) => r.description)).toEqual(["ZERO"]);
    expect(result.toInsert.map((r) => r.description)).toEqual(["NEW"]);
    expect(result.rowCount).toBe(3);
    expect(result.firstPostedOn).toBe("2026-01-01");
    expect(result.lastPostedOn).toBe("2026-01-01");
  });

  it("inserts nothing when the same file is imported twice", () => {
    const file = [
      "Date,Description,Amount",
      "1/5/2026,FEE,-25.00",
      "1/5/2026,FEE,-25.00",
      "1/6/2026,RENT,3654.82",
    ].join("\n");

    const first = plan(file);
    expect(first.toInsert).toHaveLength(3);

    const second = plan(file, { state: stored(first.toInsert) });
    expect(second.toInsert).toHaveLength(0);
    expect(second.duplicates).toHaveLength(3);
  });

  it("keeps two equal rows in one day", () => {
    const result = plan(
      [
        "Date,Description,Amount",
        "1/5/2026,FEE,-25.00",
        "1/5/2026,FEE,-25.00",
      ].join("\n"),
    );

    expect(result.toInsert).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("inserts only the rows past what is stored from an overlapping file", () => {
    const january = plan(
      [
        "Date,Description,Amount",
        "1/30/2026,FEE,-25.00",
        "1/31/2026,RENT,3654.82",
      ].join("\n"),
    );
    const overlap = plan(
      [
        "Date,Description,Amount",
        "1/30/2026,FEE,-25.00",
        "1/30/2026,FEE,-25.00",
        "1/31/2026,RENT,3654.82",
        "2/2/2026,RENT,3654.82",
      ].join("\n"),
      { state: stored(january.toInsert) },
    );

    expect(overlap.toInsert.map((r) => [r.rowNumber, r.postedOn])).toEqual([
      [3, "2026-01-30"],
      [5, "2026-02-02"],
    ]);
    expect(overlap.duplicates).toHaveLength(2);
  });

  it("dedupes by external id when the mapping has one", () => {
    const mapping: CsvMapping = { ...signed, idColumn: "Id" };
    const file = [
      "Date,Description,Amount,Id",
      "1/5/2026,FEE,-25.00,T1",
      "1/5/2026,FEE,-25.00,T2",
      "1/5/2026,FEE,-25.00,T2",
      "1/6/2026,NO ID,-5.00,",
    ].join("\n");

    const first = plan(file, { mapping });
    expect(first.toInsert.map((r) => r.externalId)).toEqual(["T1", "T2", null]);
    expect(first.duplicates.map((r) => r.rowNumber)).toEqual([4]);

    const again = plan(file, { mapping, state: stored(first.toInsert) });
    expect(again.toInsert).toHaveLength(0);
    expect(again.duplicates).toHaveLength(4);
  });

  it("makes a stored id with a different date, description, or amount an error", () => {
    const mapping: CsvMapping = { ...signed, idColumn: "Id" };
    const first = plan(
      ["Date,Description,Amount,Id", "1/5/2026,FEE,-25.00,T1"].join("\n"),
      { mapping },
    );
    const file = [
      "Date,Description,Amount,Id",
      "1/5/2026,SERVICE FEE,-25.00,T1",
      "1/6/2026,RENT,100.00,T2",
    ].join("\n");

    const renamed = plan(file, { mapping, state: stored(first.toInsert) });
    expect(renamed.errors).toEqual([
      {
        rowNumber: 2,
        cells: ["1/5/2026", "SERVICE FEE", "-25.00", "T1"],
        message:
          'The id "T1" was imported before with a different date, description, or amount',
        skipped: false,
      },
    ]);
    expect(renamed.duplicates).toHaveLength(0);
    expect(renamed.transactionCount).toBe(1);
    expect(unskippedErrors(renamed)).toHaveLength(1);

    const skipped = plan(file, {
      mapping,
      state: stored(first.toInsert),
      skipRows: [2],
    });
    expect(unskippedErrors(skipped)).toEqual([]);
    expect(skipped.toInsert.map((r) => r.externalId)).toEqual(["T2"]);
  });

  it("makes an id repeated in the file with a different row an error", () => {
    const result = plan(
      [
        "Date,Description,Amount,Id",
        "1/5/2026,FEE,-25.00,T1",
        "1/5/2026,FEE,-25.00,T1",
        "1/6/2026,RENT,100.00,T1",
      ].join("\n"),
      { mapping: { ...signed, idColumn: "Id" } },
    );

    expect(result.toInsert.map((r) => r.rowNumber)).toEqual([2]);
    expect(result.duplicates.map((r) => r.rowNumber)).toEqual([3]);
    expect(result.errors).toMatchObject([
      {
        rowNumber: 4,
        message:
          'The id "T1" is also on row 2 with a different date, description, or amount',
      },
    ]);
  });

  it("does not double rows when the id column is added after imports without one", () => {
    const withId: CsvMapping = { ...signed, idColumn: "Id" };
    const january = [
      "Date,Description,Amount,Id",
      "1/5/2026,FEE,-25.00,T1",
      "1/5/2026,FEE,-25.00,T2",
      "1/6/2026,RENT,100.00,T3",
    ].join("\n");
    const first = plan(january, { mapping: signed });
    expect(first.toInsert.map((r) => r.externalId)).toEqual([null, null, null]);

    const overlap = plan(
      [january, "1/5/2026,FEE,-25.00,T4", "1/7/2026,NEW,5.00,T5"].join("\n"),
      { mapping: withId, state: stored(first.toInsert) },
    );
    expect(overlap.duplicates.map((r) => r.externalId)).toEqual([
      "T1",
      "T2",
      "T3",
    ]);
    expect(overlap.toInsert.map((r) => r.externalId)).toEqual(["T4", "T5"]);

    const again = plan(
      [january, "1/5/2026,FEE,-25.00,T4", "1/7/2026,NEW,5.00,T5"].join("\n"),
      { mapping: withId, state: stored(first.toInsert, overlap.toInsert) },
    );
    expect(again.toInsert).toHaveLength(0);
  });

  it("does not double or drop rows when the id column is removed after imports with one", () => {
    const withId: CsvMapping = { ...signed, idColumn: "Id" };
    const january = [
      "Date,Description,Amount,Id",
      "1/5/2026,FEE,-25.00,T1",
      "1/5/2026,FEE,-25.00,T2",
      "1/6/2026,RENT,100.00,T3",
    ].join("\n");
    const first = plan(january, { mapping: withId });
    expect(first.toInsert).toHaveLength(3);

    const overlap = plan(
      [january, "1/5/2026,FEE,-25.00,T4", "1/7/2026,NEW,5.00,T5"].join("\n"),
      { mapping: signed, state: stored(first.toInsert) },
    );
    expect(overlap.duplicates.map((r) => r.rowNumber)).toEqual([2, 3, 4]);
    expect(overlap.toInsert.map((r) => [r.rowNumber, r.externalId])).toEqual([
      [5, null],
      [6, null],
    ]);

    const again = plan(january, {
      mapping: signed,
      state: stored(first.toInsert, overlap.toInsert),
    });
    expect(again.toInsert).toHaveLength(0);
  });

  it("does not let an id row and a row without an id claim the same stored row", () => {
    const earlier = plan(
      ["Date,Description,Amount", "1/5/2026,FEE,-25.00"].join("\n"),
    );

    const result = plan(
      [
        "Date,Description,Amount,Id",
        "1/5/2026,FEE,-25.00,",
        "1/5/2026,FEE,-25.00,T1",
      ].join("\n"),
      {
        mapping: { ...signed, idColumn: "Id" },
        state: stored(earlier.toInsert),
      },
    );

    expect(result.duplicates.map((r) => r.externalId)).toEqual(["T1"]);
    expect(result.toInsert.map((r) => [r.rowNumber, r.externalId])).toEqual([
      [2, null],
    ]);
  });

  it("reports the date range and external ids to read stored rows for", () => {
    const parsed = rows(
      [
        "Date,Description,Amount,Id",
        "12/30/2025,OLD,1.00,X",
        "2/1/2026,B,1.00,T2",
        "1/5/2026,A,1.00,T1",
        "1/7/2026,ZERO,0.00,T3",
      ].join("\n"),
    );
    const outcomes = parseRows(parsed, 1, { ...signed, idColumn: "Id" });

    expect(dedupeRange(importCandidates(outcomes, "2026-01-01"))).toEqual({
      from: "2026-01-05",
      to: "2026-02-01",
      externalIds: ["T2", "T1"],
    });
    expect(dedupeRange([])).toBeNull();
  });
});
