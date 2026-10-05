import { describe, expect, it } from "vitest";

import { hashCsvRow, parseCsvText } from "./csv";

describe("parseCsvText", () => {
  it("drops a BOM and keeps quoted commas and blank lines", () => {
    const rows = parseCsvText(
      '\uFEFFDate,Description,Amount\r\n1/2/2026,"RENT, UNIT A","1,000.00"\r\n\r\n',
    );

    expect(rows).toEqual([
      ["Date", "Description", "Amount"],
      ["1/2/2026", "RENT, UNIT A", "1,000.00"],
      [""],
      [""],
    ]);
  });

  it("rejects a file with a misplaced quote instead of merging later rows", () => {
    expect(() =>
      parseCsvText(
        'Date,Description,Amount\n1/2/2026,"BAD "QUOTE" CO,100.00\n1/3/2026,RENT,200.00\n',
      ),
    ).toThrow(
      "Row 2 has a quote mark that does not match, so the rows after it cannot be read",
    );
  });

  it("rejects a file with a quote that is never closed", () => {
    expect(() =>
      parseCsvText(
        'Date,Description,Amount\n1/2/2026,A,1.00\n1/3/2026,"OPEN QUOTE,100.00\n1/4/2026,RENT,200.00\n',
      ),
    ).toThrow("Row 3 has a quote mark that does not match");
  });

  it("accepts a quote inside an unquoted cell", () => {
    expect(parseCsvText('Date,Description\n1/2/2026,B "x" y')).toEqual([
      ["Date", "Description"],
      ["1/2/2026", 'B "x" y'],
    ]);
  });
});

describe("hashCsvRow", () => {
  it("hashes the cells joined with a unit separator", () => {
    expect(hashCsvRow(["a", "b"])).toBe(hashCsvRow(["a", "b"]));
    expect(hashCsvRow(["a", "b"])).not.toBe(hashCsvRow(["ab"]));
    expect(hashCsvRow(["a"])).toMatch(/^[0-9a-f]{64}$/);
  });
});
