import type { IsoDate } from "@moonship/shared";

import type { CsvRowOutcome, DedupeState, ImportPlan } from "./csv-import";
import type { BillingStore, DedupeRange } from "./ports";
import type { CsvMapping, ImportBatch } from "./types";
import {
  dedupeRange,
  findHeaderRow,
  headersAt,
  importCandidates,
  parseRows,
  planImport,
  unskippedErrors,
} from "./csv-import";

export interface ParsedImport {
  headerRow: number;
  headers: string[];
  outcomes: CsvRowOutcome[];
}

export function readImportRows(
  rows: readonly string[][],
  mapping: CsvMapping,
  headerRow?: number,
): ParsedImport {
  const row = headerRow ?? findHeaderRow(rows, mapping);
  if (row === null) {
    throw new Error("No row in the file has every matched column");
  }
  return {
    headerRow: row,
    headers: headersAt(rows, row),
    outcomes: parseRows(rows, row, mapping),
  };
}

const NOTHING_STORED: DedupeState = {
  externalIds: new Set(),
  counts: new Map(),
};

export async function planFileImport(
  parsed: ParsedImport,
  options: {
    trackingStart: IsoDate;
    skipRows?: readonly number[];
    loadStored: (range: DedupeRange) => Promise<DedupeState>;
  },
): Promise<ImportPlan> {
  const range = dedupeRange(
    importCandidates(parsed.outcomes, options.trackingStart),
  );
  const stored = range ? await options.loadStored(range) : NOTHING_STORED;
  return planImport(parsed.outcomes, {
    trackingStart: options.trackingStart,
    stored,
    skipRows: options.skipRows,
  });
}

export async function commitImport(
  store: BillingStore,
  input: {
    propertyId: string;
    fileName: string;
    rows: readonly string[][];
    mapping: CsvMapping;
    headerRow?: number;
    skipRows?: readonly number[];
    trackingStart: IsoDate;
    importedAt: Date;
    newId: () => string;
    hashRow: (cells: string[]) => string;
  },
): Promise<{ batch: ImportBatch; plan: ImportPlan }> {
  const parsed = readImportRows(input.rows, input.mapping, input.headerRow);
  const bankAccount = await store.lockBankAccount(input.propertyId);
  const plan = await planFileImport(parsed, {
    trackingStart: input.trackingStart,
    skipRows: input.skipRows,
    loadStored: (range) =>
      store.loadDedupeState(input.propertyId, bankAccount.id, range),
  });
  const blocking = unskippedErrors(plan);
  if (blocking.length > 0) {
    throw new Error(
      `Fix the column matching or skip ${blocking.length === 1 ? "row" : "rows"} ${blocking.map((e) => e.rowNumber).join(", ")}`,
    );
  }
  const batch: ImportBatch = {
    id: input.newId(),
    propertyId: input.propertyId,
    bankAccountId: bankAccount.id,
    fileName: input.fileName,
    importedAt: input.importedAt,
    rowCount: plan.rowCount,
    insertedCount: plan.toInsert.length,
    duplicateCount: plan.duplicates.length,
    beforeTrackingStartCount: plan.beforeTrackingStart.length,
    notTransactionCount: plan.notTransaction.length,
    firstPostedOn: plan.firstPostedOn,
    lastPostedOn: plan.lastPostedOn,
  };
  await store.insertImportBatch(
    batch,
    plan.toInsert.map((row) => ({
      id: input.newId(),
      postedOn: row.postedOn,
      description: row.description,
      descriptionKey: row.descriptionKey,
      amountCents: row.amountCents,
      externalId: row.externalId,
      rawRowHash: input.hashRow(row.cells),
    })),
  );
  await store.saveCsvMapping(input.propertyId, bankAccount.id, input.mapping);
  return { batch, plan };
}

export async function removeImportBatch(
  store: BillingStore,
  propertyId: string,
  batchId: string,
): Promise<"removed" | "notFound" | "sorted"> {
  await store.lockBankAccount(propertyId);
  const batch = await store.lockImportBatch(propertyId, batchId);
  if (!batch) return "notFound";
  if (batch.sortedCount > 0) return "sorted";
  await store.deleteImportBatch(propertyId, batchId);
  return "removed";
}
