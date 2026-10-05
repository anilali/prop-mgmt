import { describe, expect, it } from "vitest";

import type {
  CsvRowOutcome,
  CsvTransactionRow,
  DedupeState,
} from "./csv-import";
import { dedupeKey, planImport } from "./csv-import";
import { detectImportFormat, fileCharset, parseOfx } from "./ofx-import";

const HEADER =
  "OFXHEADER:100 DATA:OFXSGML VERSION:102 SECURITY:NONE ENCODING:USASCII CHARSET:1252 COMPRESSION:NONE OLDFILEUID:NONE NEWFILEUID:NONE STANDALONE:NONE ";

type Fields = Partial<
  Record<
    "TRNTYPE" | "DTPOSTED" | "TRNAMT" | "FITID" | "NAME" | "MEMO" | "CHECKNUM",
    string
  >
>;

function closed(fields: Fields): string {
  return `<STMTTRN>${Object.entries(fields)
    .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
    .join("")}</STMTTRN>`;
}

function unclosed(fields: Fields): string {
  return [
    "<STMTTRN>",
    ...Object.entries(fields).map(([tag, value]) => `<${tag}>${value}`),
    "</STMTTRN>",
  ].join("\r\n");
}

function qbo(
  transactions: string[],
  options: { acctId?: string; separator?: string } = {},
): string {
  const separator = options.separator ?? "";
  return [
    HEADER,
    "<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20260301120000.000[0:GMT]</DTSERVER><LANGUAGE>ENG</LANGUAGE></SONRS></SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTRS><CURDEF>USD</CURDEF>",
    `<BANKACCTFROM><BANKID>000000000</BANKID><ACCTID>${options.acctId ?? "9900001234"}</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>`,
    "<BANKTRANLIST><DTSTART>20251215120000.000[0:GMT]</DTSTART><DTEND>20260228120000.000[0:GMT]</DTEND>",
    ...transactions,
    "</BANKTRANLIST>",
    "<LEDGERBAL><BALAMT>12345.67</BALAMT><DTASOF>20260228120000.000[0:GMT]</DTASOF></LEDGERBAL>",
    "<AVAILBAL><BALAMT>12000.00</BALAMT><DTASOF>20260228120000.000[0:GMT]</DTASOF></AVAILBAL>",
    "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join(separator);
}

const RENT: Fields = {
  TRNTYPE: "CREDIT",
  DTPOSTED: "20260105120000.000[0:GMT]",
  TRNAMT: "2500.00",
  FITID: "FIT0001",
  NAME: "Mobile Check Deposit",
};

const FEE: Fields = {
  TRNTYPE: "DEBIT",
  DTPOSTED: "20260106120000.000[0:GMT]",
  TRNAMT: "-25.00",
  FITID: "FIT0002",
  NAME: "SERVICE FEE",
};

const OLD: Fields = {
  TRNTYPE: "DEBIT",
  DTPOSTED: "20251220120000.000[0:GMT]",
  TRNAMT: "-10.00",
  FITID: "FIT0000",
  NAME: "OLD FEE",
};

type Transaction = Extract<CsvRowOutcome, { kind: "transaction" }>;

function transactions(text: string): Transaction[] {
  return parseOfx(text).outcomes.filter(
    (outcome): outcome is Transaction => outcome.kind === "transaction",
  );
}

function stored(rows: CsvTransactionRow[]): DedupeState {
  const externalIds = new Map<string, string>();
  const counts = new Map<string, { total: number; withoutId: number }>();
  for (const row of rows) {
    const key = dedupeKey(row);
    const count = counts.get(key) ?? { total: 0, withoutId: 0 };
    count.total += 1;
    if (row.externalId === null) count.withoutId += 1;
    counts.set(key, count);
    if (row.externalId !== null) externalIds.set(row.externalId, key);
  }
  return { externalIds, counts };
}

const EMPTY: DedupeState = { externalIds: new Map(), counts: new Map() };

describe("detectImportFormat", () => {
  it("finds OFX by its header or its OFX element", () => {
    expect(detectImportFormat(qbo([]))).toBe("ofx");
    expect(detectImportFormat("\uFEFFOFXHEADER:100\r\nDATA:OFXSGML")).toBe(
      "ofx",
    );
    expect(
      detectImportFormat('<?xml version="1.0"?>\n<?OFX OFXHEADER="200"?><OFX>'),
    ).toBe("ofx");
    expect(detectImportFormat("Date,Description,Amount\n1/5/2026,FEE,-1")).toBe(
      "csv",
    );
  });
});

describe("fileCharset", () => {
  it("reads OFX 1 headers as Windows-1252 unless they say UTF-8", () => {
    expect(fileCharset(HEADER)).toBe("windows-1252");
    expect(fileCharset("OFXHEADER:100\nENCODING:UTF-8\nCHARSET:NONE\n")).toBe(
      "utf-8",
    );
  });

  it("follows the XML declaration and treats other files as UTF-8", () => {
    expect(
      fileCharset('<?xml version="1.0" encoding="windows-1252"?><OFX>'),
    ).toBe("windows-1252");
    expect(fileCharset('<?xml version="1.0" encoding="UTF-8"?><OFX>')).toBe(
      "utf-8",
    );
    expect(fileCharset("Date,Description,Amount")).toBe("utf-8");
  });

  it("decodes Windows-1252 bytes into the right characters", () => {
    const bytes = Uint8Array.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x92, 0x80]);
    expect(new TextDecoder(fileCharset(HEADER)).decode(bytes)).toBe(
      "Caf\u00e9 \u2019\u20ac",
    );
  });
});

describe("parseOfx", () => {
  it("reads closed tags on one line with the statement details", () => {
    const statement = parseOfx(qbo([closed(RENT), closed(FEE)]));

    expect(statement.accountLast4).toBe("1234");
    expect(statement.startOn).toBe("2025-12-15");
    expect(statement.endOn).toBe("2026-02-28");
    expect(statement.ledgerBalance).toEqual({
      amountCents: 1_234_567,
      asOf: "2026-02-28",
    });
    expect(statement.outcomes).toEqual([
      {
        kind: "transaction",
        rowNumber: 1,
        cells: [
          "20260105120000.000[0:GMT]",
          "CREDIT",
          "2500.00",
          "FIT0001",
          "Mobile Check Deposit",
          "",
          "",
        ],
        postedOn: "2026-01-05",
        description: "Mobile Check Deposit",
        descriptionKey: "mobile check deposit",
        amountCents: 250_000,
        externalId: "FIT0001",
      },
      expect.objectContaining({
        rowNumber: 2,
        postedOn: "2026-01-06",
        amountCents: -2500,
        externalId: "FIT0002",
      }),
    ]);
  });

  it("reads leaf tags without closing tags across CRLF lines", () => {
    const text = qbo([unclosed(RENT), unclosed({ ...FEE, MEMO: "" })], {
      separator: "\r\n",
    }).replace(HEADER, HEADER.split(" ").join("\r\n"));

    const rows = transactions(text);

    expect(rows.map((row) => [row.postedOn, row.amountCents])).toEqual([
      ["2026-01-05", 250_000],
      ["2026-01-06", -2500],
    ]);
    expect(rows[1]?.description).toBe("SERVICE FEE");
    expect(parseOfx(text).accountLast4).toBe("1234");
  });

  it("reads OFX 2 XML files", () => {
    const text = [
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>',
      qbo([closed({ ...FEE, NAME: "ACME &amp; SONS" })], { separator: "\n" })
        .slice(HEADER.length)
        .trim(),
    ].join("\n");

    const [row] = transactions(text);

    expect(row?.description).toBe("ACME & SONS");
    expect(row?.amountCents).toBe(-2500);
  });

  it("keeps Windows-1252 characters that were decoded from the file", () => {
    const [row] = transactions(
      qbo([closed({ ...FEE, NAME: "CAF\u00c9 L\u2019ETOILE \u20ac" })]),
    );

    expect(row?.description).toBe("CAF\u00c9 L\u2019ETOILE \u20ac");
  });

  it("adds the check number to checks", () => {
    const check: Fields = {
      TRNTYPE: "CHECK",
      DTPOSTED: "20260107",
      TRNAMT: "-480.00",
      FITID: "FIT0003",
      NAME: "Check",
      CHECKNUM: "1026",
    };
    const rows = transactions(
      qbo([
        closed(check),
        closed({
          ...check,
          FITID: "FIT0004",
          NAME: "CHECK 1027",
          CHECKNUM: "1027",
        }),
      ]),
    );

    expect(rows.map((row) => row.description)).toEqual([
      "Check #1026",
      "CHECK 1027",
    ]);
    expect(rows[0]?.descriptionKey).toBe("check");
  });

  it("uses the memo when the name is a cut-off or generic copy of it", () => {
    const rows = transactions(
      qbo([
        closed({
          ...FEE,
          FITID: "A",
          NAME: "CITY POWER AND LIGHT UTIL BILL **",
          MEMO: "CITY POWER AND LIGHT UTIL BILL PAYMENT 555123",
        }),
        closed({
          ...FEE,
          FITID: "B",
          NAME: "CITY POWER AND ******* UTIL BILL",
          MEMO: "CITY POWER AND 1234567 UTIL BILL PAYMENT",
        }),
        closed({ ...FEE, FITID: "C", NAME: "DEBIT", MEMO: "ACME HARDWARE 42" }),
        closed({ ...FEE, FITID: "D", NAME: "", MEMO: "WATER DISTRICT" }),
        closed({ ...FEE, FITID: "E", NAME: "ROOFING CO", MEMO: "INVOICE 88" }),
      ]),
    );

    expect(rows.map((row) => row.description)).toEqual([
      "CITY POWER AND LIGHT UTIL BILL PAYMENT 555123",
      "CITY POWER AND 1234567 UTIL BILL PAYMENT",
      "ACME HARDWARE 42",
      "WATER DISTRICT",
      "ROOFING CO",
    ]);
  });

  it("makes rows that cannot be read error rows", () => {
    const outcomes = parseOfx(
      qbo([
        closed({ ...FEE, FITID: "A", DTPOSTED: "20260230" }),
        closed({ ...FEE, FITID: "B", DTPOSTED: "" }),
        closed({ ...FEE, FITID: "C", TRNAMT: "abc" }),
        closed({ ...FEE, FITID: "D", TRNAMT: "-99999999.99" }),
        closed({ ...FEE, FITID: "" }),
        closed({ ...FEE, FITID: "F", TRNAMT: "" }),
      ]),
    ).outcomes;

    expect(
      outcomes.map((outcome) =>
        outcome.kind === "error" ? [outcome.rowNumber, outcome.message] : null,
      ),
    ).toEqual([
      [1, '"20260230" is not an OFX date'],
      [2, "The date is blank"],
      [3, '"abc" is not an amount'],
      [4, '"-99999999.99" is larger than $21,474,836.47'],
      [5, "The bank's transaction id (FITID) is blank"],
      [6, "The amount is blank"],
    ]);
  });

  it("keeps only the last four digits of the account", () => {
    expect(parseOfx(qbo([], { acctId: "XXXXXX5678" })).accountLast4).toBe(
      "5678",
    );
    expect(parseOfx(qbo([], { acctId: "ABC" })).accountLast4).toBeNull();
  });

  it("rejects files that are not one bank statement", () => {
    expect(() => parseOfx("Date,Description,Amount")).toThrow(
      "not a QuickBooks (QBO) or OFX file",
    );
    expect(() =>
      parseOfx(`${HEADER}<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>`),
    ).toThrow("no bank statement");
    const two = qbo([closed(FEE)]).replace(
      "</BANKMSGSRSV1>",
      "<STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>1111222233</ACCTID></BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    );
    expect(() => parseOfx(two)).toThrow("more than one bank account");
  });
});

describe("planImport with OFX rows", () => {
  const file = qbo([closed(OLD), closed(RENT), closed(FEE)]);

  it("skips rows before tracking start and zero amounts", () => {
    const plan = planImport(
      parseOfx(
        qbo([
          closed(OLD),
          closed(RENT),
          closed({ ...FEE, FITID: "Z", TRNAMT: "0.00" }),
        ]),
      ).outcomes,
      { trackingStart: "2026-01-01", stored: EMPTY },
    );

    expect(plan.rowCount).toBe(3);
    expect(plan.beforeTrackingStart.map((row) => row.externalId)).toEqual([
      "FIT0000",
    ]);
    expect(plan.zeroAmount.map((row) => row.externalId)).toEqual(["Z"]);
    expect(plan.toInsert.map((row) => row.externalId)).toEqual(["FIT0001"]);
  });

  it("inserts nothing when the same file is imported twice", () => {
    const first = planImport(parseOfx(file).outcomes, {
      trackingStart: "2026-01-01",
      stored: EMPTY,
    });
    const second = planImport(parseOfx(file).outcomes, {
      trackingStart: "2026-01-01",
      stored: stored(first.toInsert),
    });

    expect(first.toInsert).toHaveLength(2);
    expect(second.toInsert).toHaveLength(0);
    expect(second.duplicates).toHaveLength(2);
  });

  it("inserts only new FITIDs from an overlapping file", () => {
    const first = planImport(parseOfx(file).outcomes, {
      trackingStart: "2026-01-01",
      stored: EMPTY,
    });
    const later = qbo([
      closed(FEE),
      closed({ ...FEE, FITID: "FIT0005" }),
      closed({ ...RENT, FITID: "FIT0006", DTPOSTED: "20260205" }),
    ]);

    const plan = planImport(parseOfx(later).outcomes, {
      trackingStart: "2026-01-01",
      stored: stored(first.toInsert),
    });

    expect(plan.duplicates.map((row) => row.externalId)).toEqual(["FIT0002"]);
    expect(plan.toInsert.map((row) => row.externalId)).toEqual([
      "FIT0005",
      "FIT0006",
    ]);
  });

  it("uses up a stored row without an id before inserting", () => {
    const fromCsv = transactions(qbo([closed(FEE)])).map((row) => ({
      ...row,
      externalId: null,
    }));

    const plan = planImport(parseOfx(file).outcomes, {
      trackingStart: "2026-01-01",
      stored: stored(fromCsv),
    });

    expect(plan.duplicates.map((row) => row.externalId)).toEqual(["FIT0002"]);
    expect(plan.toInsert.map((row) => row.externalId)).toEqual(["FIT0001"]);
  });

  it("makes a stored FITID with a different amount an error row", () => {
    const first = transactions(file);
    const changed = qbo([closed({ ...FEE, TRNAMT: "-26.00" })]);

    const plan = planImport(parseOfx(changed).outcomes, {
      trackingStart: "2026-01-01",
      stored: stored(first),
    });

    expect(plan.errors).toEqual([
      expect.objectContaining({
        rowNumber: 1,
        message:
          'The id "FIT0002" was imported before with a different date, description, or amount',
        skipped: false,
      }),
    ]);
  });
});
