import type { IsoDate } from "@moonship/shared";

import type { CsvRowOutcome, DedupeState, ImportPlan } from "./csv-import";
import type { OfxStatement } from "./ofx-import";
import type { BillingStore, DedupeRange } from "./ports";
import type { CsvMapping, ImportBatch, ImportFormat } from "./types";
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

export const NOTHING_STORED: DedupeState = {
  externalIds: new Map(),
  counts: new Map(),
};

export async function planFileImport(
  parsed: { outcomes: readonly CsvRowOutcome[] },
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

interface CommitInput {
  propertyId: string;
  fileName: string;
  skipRows?: readonly number[];
  trackingStart: IsoDate;
  importedAt: Date;
  newId: () => string;
  hashRow: (cells: string[]) => string;
}

async function commitOutcomes(
  store: BillingStore,
  input: CommitInput & {
    outcomes: readonly CsvRowOutcome[];
    format: ImportFormat;
    accountLast4: string | null;
    fixAdvice: string;
  },
): Promise<{ batch: ImportBatch; plan: ImportPlan }> {
  const bankAccount = await store.lockBankAccount(input.propertyId);
  const plan = await planFileImport(input, {
    trackingStart: input.trackingStart,
    skipRows: input.skipRows,
    loadStored: (range) =>
      store.loadDedupeState(input.propertyId, bankAccount.id, range),
  });
  const blocking = unskippedErrors(plan);
  if (blocking.length > 0) {
    throw new Error(
      `${input.fixAdvice} ${blocking.length === 1 ? "row" : "rows"} ${blocking.map((e) => e.rowNumber).join(", ")}`,
    );
  }
  const batch: ImportBatch = {
    id: input.newId(),
    propertyId: input.propertyId,
    bankAccountId: bankAccount.id,
    fileName: input.fileName,
    format: input.format,
    accountLast4: input.accountLast4,
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
  return { batch, plan };
}

export async function commitImport(
  store: BillingStore,
  input: CommitInput & {
    rows: readonly string[][];
    mapping: CsvMapping;
    headerRow?: number;
  },
): Promise<{ batch: ImportBatch; plan: ImportPlan }> {
  const parsed = readImportRows(input.rows, input.mapping, input.headerRow);
  const result = await commitOutcomes(store, {
    ...input,
    outcomes: parsed.outcomes,
    format: "csv",
    accountLast4: null,
    fixAdvice: "Fix the column matching or skip",
  });
  await store.saveCsvMapping(
    input.propertyId,
    result.batch.bankAccountId,
    input.mapping,
  );
  return result;
}

export async function commitOfxImport(
  store: BillingStore,
  input: CommitInput & { statement: OfxStatement },
): Promise<{ batch: ImportBatch; plan: ImportPlan }> {
  return commitOutcomes(store, {
    ...input,
    outcomes: input.statement.outcomes,
    format: "ofx",
    accountLast4: input.statement.accountLast4,
    fixAdvice: "Skip",
  });
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
