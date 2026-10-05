import type { IsoDate } from "@moonship/shared";
import {
  formatCents,
  isIsoDate,
  MAX_CENTS,
  parseCents,
} from "@moonship/shared";

import type { CsvDateFormat, CsvMapping } from "./types";
import { descriptionKey } from "./suggestions";

export interface CsvTransactionRow {
  rowNumber: number;
  cells: string[];
  postedOn: IsoDate;
  description: string;
  descriptionKey: string;
  amountCents: number;
  externalId: string | null;
}

export interface CsvErrorRow {
  rowNumber: number;
  cells: string[];
  message: string;
}

export interface CsvOtherRow {
  rowNumber: number;
  cells: string[];
}

export type CsvRowOutcome =
  | ({ kind: "transaction" } & CsvTransactionRow)
  | ({ kind: "error" } & CsvErrorRow)
  | ({ kind: "notTransaction" } & CsvOtherRow);

export interface StoredKeyCount {
  total: number;
  withoutId: number;
}

export interface DedupeState {
  externalIds: ReadonlyMap<string, string>;
  counts: ReadonlyMap<string, StoredKeyCount>;
}

export interface ImportPlan {
  rowCount: number;
  transactionCount: number;
  toInsert: CsvTransactionRow[];
  duplicates: CsvTransactionRow[];
  beforeTrackingStart: CsvTransactionRow[];
  zeroAmount: CsvTransactionRow[];
  notTransaction: CsvOtherRow[];
  errors: (CsvErrorRow & { skipped: boolean })[];
  firstPostedOn: IsoDate | null;
  lastPostedOn: IsoDate | null;
}

const MIN_HEADER_CELLS = 3;

const DATE_PATTERNS: Record<
  CsvDateFormat,
  {
    pattern: RegExp;
    order: ["y" | "m" | "d", "y" | "m" | "d", "y" | "m" | "d"];
  }
> = {
  "MM/DD/YYYY": {
    pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    order: ["m", "d", "y"],
  },
  "DD/MM/YYYY": {
    pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    order: ["d", "m", "y"],
  },
  "YYYY-MM-DD": {
    pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    order: ["y", "m", "d"],
  },
};

export function parseCsvDate(
  text: string,
  format: CsvDateFormat,
): IsoDate | null {
  const { pattern, order } = DATE_PATTERNS[format];
  const match = pattern.exec(text.trim());
  if (!match) return null;
  const parts = { y: "", m: "", d: "" };
  order.forEach((part, index) => {
    parts[part] = match[index + 1] ?? "";
  });
  const date = `${parts.y}-${parts.m.padStart(2, "0")}-${parts.d.padStart(2, "0")}`;
  return isIsoDate(date) ? date : null;
}

function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

export function mappedColumns(mapping: CsvMapping): string[] {
  const amountColumns =
    mapping.amount.mode === "signed"
      ? [mapping.amount.column]
      : [mapping.amount.debitColumn, mapping.amount.creditColumn];
  return [
    mapping.dateColumn,
    mapping.descriptionColumn,
    ...amountColumns,
    ...(mapping.idColumn ? [mapping.idColumn] : []),
  ];
}

function hasColumns(cells: readonly string[], columns: string[]): boolean {
  const trimmed = cells.map((cell) => cell.trim());
  return columns.every((column) => trimmed.includes(column.trim()));
}

export function findHeaderRow(
  rows: readonly string[][],
  mapping: CsvMapping | null,
): number | null {
  const index = mapping
    ? rows.findIndex((cells) => hasColumns(cells, mappedColumns(mapping)))
    : rows.findIndex(
        (cells) =>
          cells.filter((cell) => cell.trim() !== "").length >= MIN_HEADER_CELLS,
      );
  return index === -1 ? null : index + 1;
}

export function headersAt(
  rows: readonly string[][],
  headerRow: number,
): string[] {
  const cells = rows[headerRow - 1];
  if (!Number.isInteger(headerRow) || !cells) {
    throw new Error(`Row ${headerRow} is not in the file`);
  }
  return cells.map((cell) => cell.trim());
}

function quoted(columns: readonly string[]): string {
  return columns.map((column) => `"${column}"`).join(", ");
}

export function headerProblem(
  headers: readonly string[],
  headerRow: number,
  mapping: CsvMapping,
): string | null {
  const columns = [...new Set(mappedColumns(mapping).map((c) => c.trim()))];
  const missing = columns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return `Row ${headerRow} has no column named ${quoted(missing)}`;
  }
  const repeated = columns.filter(
    (column) => headers.filter((header) => header === column).length > 1,
  );
  if (repeated.length > 0) {
    return `Row ${headerRow} has more than one column named ${quoted(repeated)}`;
  }
  return null;
}

type AmountResult =
  | { kind: "blank" }
  | { kind: "invalid"; message: string; hasAmount: boolean }
  | { kind: "ok"; cents: number };

function readAmount(text: string): AmountResult {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "blank" };
  let cents: number;
  try {
    cents = parseCents(trimmed);
  } catch {
    return {
      kind: "invalid",
      message: `"${trimmed}" is not an amount`,
      hasAmount: false,
    };
  }
  if (Math.abs(cents) > MAX_CENTS) {
    return {
      kind: "invalid",
      message: `"${trimmed}" is larger than ${formatCents(MAX_CENTS)}`,
      hasAmount: true,
    };
  }
  return { kind: "ok", cents };
}

function rowAmount(
  cell: (column: string) => string,
  mapping: CsvMapping,
): AmountResult {
  const amount = mapping.amount;
  if (amount.mode === "signed") {
    const result = readAmount(cell(amount.column));
    if (result.kind !== "ok" || !amount.flipSign) return result;
    return { kind: "ok", cents: result.cents === 0 ? 0 : -result.cents };
  }
  const debit = readAmount(cell(amount.debitColumn));
  const credit = readAmount(cell(amount.creditColumn));
  const hasAmount = [debit, credit].some(
    (result) =>
      result.kind === "ok" || (result.kind === "invalid" && result.hasAmount),
  );
  if (debit.kind === "invalid") return { ...debit, hasAmount };
  if (credit.kind === "invalid") return { ...credit, hasAmount };
  if (debit.kind === "blank" && credit.kind === "blank") {
    return { kind: "blank" };
  }
  const debitCents = debit.kind === "ok" ? Math.abs(debit.cents) : 0;
  const creditCents = credit.kind === "ok" ? Math.abs(credit.cents) : 0;
  return { kind: "ok", cents: creditCents - debitCents };
}

export function parseRows(
  rows: readonly string[][],
  headerRow: number,
  mapping: CsvMapping,
): CsvRowOutcome[] {
  const headers = headersAt(rows, headerRow);
  const problem = headerProblem(headers, headerRow, mapping);
  if (problem !== null) throw new Error(problem);
  const indexOf = (column: string) => headers.indexOf(column.trim());

  const outcomes: CsvRowOutcome[] = [];
  rows.slice(headerRow).forEach((cells, offset) => {
    if (isBlank(cells)) return;
    const rowNumber = headerRow + offset + 1;
    const cell = (column: string) => cells[indexOf(column)] ?? "";
    const dateText = cell(mapping.dateColumn).trim();
    const postedOn = parseCsvDate(dateText, mapping.dateFormat);
    const amount = rowAmount(cell, mapping);

    if (postedOn === null) {
      if (
        amount.kind === "ok" ||
        (amount.kind === "invalid" && amount.hasAmount)
      ) {
        outcomes.push({
          kind: "error",
          rowNumber,
          cells,
          message:
            dateText === ""
              ? "The date is blank"
              : `"${dateText}" is not a ${mapping.dateFormat} date`,
        });
      } else {
        outcomes.push({ kind: "notTransaction", rowNumber, cells });
      }
      return;
    }
    if (amount.kind !== "ok") {
      outcomes.push({
        kind: "error",
        rowNumber,
        cells,
        message:
          amount.kind === "blank" ? "The amount is blank" : amount.message,
      });
      return;
    }
    const description = cell(mapping.descriptionColumn).trim();
    const externalId = mapping.idColumn
      ? cell(mapping.idColumn).trim() || null
      : null;
    outcomes.push({
      kind: "transaction",
      rowNumber,
      cells,
      postedOn,
      description,
      descriptionKey: descriptionKey(description),
      amountCents: amount.cents,
      externalId,
    });
  });
  return outcomes;
}

export function dedupeKey(row: {
  postedOn: IsoDate;
  descriptionKey: string;
  amountCents: number;
}): string {
  return JSON.stringify([row.postedOn, row.descriptionKey, row.amountCents]);
}

function toTransactionRow(
  outcome: Extract<CsvRowOutcome, { kind: "transaction" }>,
): CsvTransactionRow {
  return {
    rowNumber: outcome.rowNumber,
    cells: outcome.cells,
    postedOn: outcome.postedOn,
    description: outcome.description,
    descriptionKey: outcome.descriptionKey,
    amountCents: outcome.amountCents,
    externalId: outcome.externalId,
  };
}

export function importCandidates(
  outcomes: readonly CsvRowOutcome[],
  trackingStart: IsoDate,
): CsvTransactionRow[] {
  return outcomes.flatMap((outcome) =>
    outcome.kind === "transaction" &&
    outcome.amountCents !== 0 &&
    outcome.postedOn >= trackingStart
      ? [toTransactionRow(outcome)]
      : [],
  );
}

export function dedupeRange(
  candidates: readonly CsvTransactionRow[],
): { from: IsoDate; to: IsoDate; externalIds: string[] } | null {
  const first = candidates[0];
  if (!first) return null;
  let from = first.postedOn;
  let to = first.postedOn;
  const externalIds = new Set<string>();
  for (const row of candidates) {
    if (row.postedOn < from) from = row.postedOn;
    if (row.postedOn > to) to = row.postedOn;
    if (row.externalId !== null) externalIds.add(row.externalId);
  }
  return { from, to, externalIds: [...externalIds] };
}

type Decision =
  | { kind: "insert" }
  | { kind: "duplicate" }
  | { kind: "error"; message: string };

function increment(map: Map<string, number>, key: string): number {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

function dedupeDecisions(
  rows: readonly CsvTransactionRow[],
  stored: DedupeState,
): Map<number, Decision> {
  const firstById = new Map<string, CsvTransactionRow>();
  const claimed = new Map<string, number>();
  const usedWithoutId = new Map<string, number>();

  function decideWithId(row: CsvTransactionRow, id: string): Decision {
    const key = dedupeKey(row);
    const earlier = firstById.get(id);
    if (earlier) {
      return dedupeKey(earlier) === key
        ? { kind: "duplicate" }
        : {
            kind: "error",
            message: `The id "${id}" is also on row ${earlier.rowNumber} with a different date, description, or amount`,
          };
    }
    firstById.set(id, row);
    const storedKey = stored.externalIds.get(id);
    if (storedKey !== undefined) {
      if (storedKey !== key) {
        return {
          kind: "error",
          message: `The id "${id}" was imported before with a different date, description, or amount`,
        };
      }
      increment(claimed, key);
      return { kind: "duplicate" };
    }
    const withoutId = stored.counts.get(key)?.withoutId ?? 0;
    if ((usedWithoutId.get(key) ?? 0) < withoutId) {
      increment(usedWithoutId, key);
      increment(claimed, key);
      return { kind: "duplicate" };
    }
    return { kind: "insert" };
  }

  const decisions = new Map<number, Decision>();
  for (const row of rows) {
    if (row.externalId !== null) {
      decisions.set(row.rowNumber, decideWithId(row, row.externalId));
    }
  }
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.externalId !== null) continue;
    const key = dedupeKey(row);
    const available =
      (stored.counts.get(key)?.total ?? 0) - (claimed.get(key) ?? 0);
    decisions.set(
      row.rowNumber,
      increment(seen, key) > available
        ? { kind: "insert" }
        : { kind: "duplicate" },
    );
  }
  return decisions;
}

export function planImport(
  outcomes: readonly CsvRowOutcome[],
  options: {
    trackingStart: IsoDate;
    stored: DedupeState;
    skipRows?: readonly number[];
  },
): ImportPlan {
  const skip = new Set(options.skipRows ?? []);
  const plan: ImportPlan = {
    rowCount: outcomes.length,
    transactionCount: 0,
    toInsert: [],
    duplicates: [],
    beforeTrackingStart: [],
    zeroAmount: [],
    notTransaction: [],
    errors: [],
    firstPostedOn: null,
    lastPostedOn: null,
  };
  const decisions = dedupeDecisions(
    importCandidates(outcomes, options.trackingStart),
    options.stored,
  );

  for (const outcome of outcomes) {
    if (outcome.kind === "error") {
      plan.errors.push({
        rowNumber: outcome.rowNumber,
        cells: outcome.cells,
        message: outcome.message,
        skipped: skip.has(outcome.rowNumber),
      });
      continue;
    }
    if (outcome.kind === "notTransaction") {
      plan.notTransaction.push({
        rowNumber: outcome.rowNumber,
        cells: outcome.cells,
      });
      continue;
    }
    const row = toTransactionRow(outcome);
    if (row.amountCents === 0) {
      plan.zeroAmount.push(row);
      continue;
    }
    if (row.postedOn < options.trackingStart) {
      plan.beforeTrackingStart.push(row);
      continue;
    }
    const decision = decisions.get(row.rowNumber);
    if (!decision) {
      throw new Error(`Row ${row.rowNumber} has no import decision`);
    }
    if (decision.kind === "error") {
      plan.errors.push({
        rowNumber: row.rowNumber,
        cells: row.cells,
        message: decision.message,
        skipped: skip.has(row.rowNumber),
      });
      continue;
    }
    plan.transactionCount += 1;
    if (plan.firstPostedOn === null || row.postedOn < plan.firstPostedOn) {
      plan.firstPostedOn = row.postedOn;
    }
    if (plan.lastPostedOn === null || row.postedOn > plan.lastPostedOn) {
      plan.lastPostedOn = row.postedOn;
    }
    (decision.kind === "insert" ? plan.toInsert : plan.duplicates).push(row);
  }
  return plan;
}

export function unskippedErrors(plan: ImportPlan): CsvErrorRow[] {
  return plan.errors.filter((error) => !error.skipped);
}
