import { createHash } from "node:crypto";
import Papa from "papaparse";

export function parseCsvText(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    header: false,
    delimiter: ",",
    skipEmptyLines: false,
  });
  const quoteError = result.errors.find((error) => error.type === "Quotes");
  if (quoteError) {
    const row =
      quoteError.row === undefined ? "A row" : `Row ${quoteError.row + 1}`;
    throw new Error(
      `${row} has a quote mark that does not match, so the rows after it cannot be read. Fix that row or export the file again.`,
    );
  }
  return result.data;
}

export function hashCsvRow(cells: string[]): string {
  return createHash("sha256").update(cells.join("\u001f")).digest("hex");
}
