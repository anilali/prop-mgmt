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
});

describe("hashCsvRow", () => {
  it("hashes the cells joined with a unit separator", () => {
    expect(hashCsvRow(["a", "b"])).toBe(hashCsvRow(["a", "b"]));
    expect(hashCsvRow(["a", "b"])).not.toBe(hashCsvRow(["ab"]));
    expect(hashCsvRow(["a"])).toMatch(/^[0-9a-f]{64}$/);
  });
});
