import { createHash } from "node:crypto";
import Papa from "papaparse";

export function parseCsvText(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    header: false,
    delimiter: ",",
    skipEmptyLines: false,
  });
  return result.data;
}

export function hashCsvRow(cells: string[]): string {
  return createHash("sha256").update(cells.join("\u001f")).digest("hex");
}
