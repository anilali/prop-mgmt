import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  BillingQueries,
  CsvMapping,
  CsvRowOutcome,
  ImportPlan,
} from "@moonship/billing";
import type { PropertyQueries } from "@moonship/property";
import {
  commitImport,
  CSV_DATE_FORMATS,
  findHeaderRow,
  headersAt,
  missingColumns,
  planFileImport,
  readImportRows,
  removeImportBatch,
} from "@moonship/billing";

import type { UnitOfWork } from "../unit-of-work";
import { hashCsvRow, parseCsvText } from "../csv";
import { badRequest, conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { propertyProcedure, router } from "../trpc";

export interface BankImportRouterDeps {
  billingQueries: BillingQueries;
  propertyQueries: PropertyQueries;
  unitOfWork: UnitOfWork;
}

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const PREVIEW_ROWS = 10;

const columnSchema = z.string().trim().min(1).max(255);

export const csvMappingSchema = z.object({
  dateColumn: columnSchema,
  dateFormat: z.enum(CSV_DATE_FORMATS),
  descriptionColumn: columnSchema,
  amount: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("signed"),
      column: columnSchema,
      flipSign: z.boolean(),
    }),
    z.object({
      mode: z.literal("debitCredit"),
      debitColumn: columnSchema,
      creditColumn: columnSchema,
    }),
  ]),
  idColumn: columnSchema.nullable(),
});

const csvTextSchema = z
  .string()
  .min(1)
  .refine(
    (text) => Buffer.byteLength(text, "utf8") <= MAX_CSV_BYTES,
    "The file is larger than 2 MB",
  );

const headerRowSchema = z.number().int().positive();

type RowStatus = "new" | "duplicate" | "beforeTrackingStart" | "zeroAmount";

function rowStatuses(plan: ImportPlan): Map<number, RowStatus> {
  const statuses = new Map<number, RowStatus>();
  for (const row of plan.toInsert) statuses.set(row.rowNumber, "new");
  for (const row of plan.duplicates) statuses.set(row.rowNumber, "duplicate");
  for (const row of plan.beforeTrackingStart) {
    statuses.set(row.rowNumber, "beforeTrackingStart");
  }
  for (const row of plan.zeroAmount) statuses.set(row.rowNumber, "zeroAmount");
  return statuses;
}

function parsedPreview(outcomes: CsvRowOutcome[], plan: ImportPlan) {
  const statuses = rowStatuses(plan);
  return outcomes
    .flatMap((outcome) =>
      outcome.kind === "transaction"
        ? [
            {
              rowNumber: outcome.rowNumber,
              postedOn: outcome.postedOn,
              description: outcome.description,
              amountCents: outcome.amountCents,
              externalId: outcome.externalId,
              status: statuses.get(outcome.rowNumber) ?? "new",
            },
          ]
        : [],
    )
    .slice(0, PREVIEW_ROWS);
}

function planCounts(plan: ImportPlan) {
  return {
    rows: plan.rowCount,
    transactions: plan.transactionCount,
    toInsert: plan.toInsert.length,
    duplicates: plan.duplicates.length,
    beforeTrackingStart: plan.beforeTrackingStart.length,
    zeroAmount: plan.zeroAmount.length,
    notTransaction: plan.notTransaction.length,
    errors: plan.errors.length,
  };
}

function rawRowsAfter(rows: string[][], headerRow: number | null) {
  const start = headerRow ?? 0;
  return rows
    .slice(start)
    .map((cells, offset) => ({ rowNumber: start + offset + 1, cells }))
    .filter((row) => row.cells.some((cell) => cell.trim() !== ""))
    .slice(0, PREVIEW_ROWS);
}

export function bankImportRouter(deps: BankImportRouterDeps) {
  async function trackingStartOf(propertyId: string) {
    const { property } = await loadProperty(deps.propertyQueries, propertyId);
    if (property.trackingStartDate === null) {
      throw badRequest("Set the tracking start date in Setup before importing");
    }
    return property.trackingStartDate;
  }

  function readCsv(text: string) {
    const rows = parseCsvText(text);
    if (rows.every((cells) => cells.every((cell) => cell.trim() === ""))) {
      throw badRequest("The file has no rows");
    }
    return rows;
  }

  function checkHeaderRow(rows: string[][], headerRow: number | undefined) {
    if (headerRow !== undefined && headerRow > rows.length) {
      throw badRequest(`Row ${headerRow} is not in the file`);
    }
  }

  return router({
    getMapping: propertyProcedure.query(async ({ ctx }) => {
      const bankAccount = await deps.billingQueries.getBankAccount(
        ctx.propertyId,
      );
      return bankAccount?.csvMapping ?? null;
    }),

    preview: propertyProcedure
      .input(
        z.object({
          csvText: csvTextSchema,
          mapping: csvMappingSchema.optional(),
          headerRow: headerRowSchema.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const trackingStart = await trackingStartOf(ctx.propertyId);
        const rows = readCsv(input.csvText);
        checkHeaderRow(rows, input.headerRow);
        const bankAccount = await deps.billingQueries.getBankAccount(
          ctx.propertyId,
        );
        const mapping: CsvMapping | null =
          input.mapping ?? bankAccount?.csvMapping ?? null;

        let headerRow = input.headerRow ?? null;
        let mappingError: string | null = null;
        if (mapping) {
          headerRow ??= findHeaderRow(rows, mapping);
          if (headerRow === null) {
            mappingError = "No row in the file has every matched column";
            headerRow = findHeaderRow(rows, null);
          } else {
            const missing = missingColumns(headersAt(rows, headerRow), mapping);
            if (missing.length > 0) {
              mappingError = `Row ${headerRow} has no column named ${missing.map((c) => `"${c}"`).join(", ")}`;
            }
          }
        } else {
          headerRow ??= findHeaderRow(rows, null);
        }

        const base = {
          trackingStartDate: trackingStart,
          headerRow,
          headers: headerRow === null ? [] : headersAt(rows, headerRow),
          rawRows: rawRowsAfter(rows, headerRow),
          mapping,
          mappingError,
        };
        if (!mapping || mappingError !== null || headerRow === null) {
          return {
            ...base,
            parsedRows: [],
            counts: null,
            notTransactionRows: [],
            errors: [],
          };
        }

        const parsed = readImportRows(rows, mapping, headerRow);
        const plan = await planFileImport(parsed, {
          trackingStart,
          loadStored: (range) =>
            bankAccount
              ? deps.billingQueries.loadDedupeState(
                  ctx.propertyId,
                  bankAccount.id,
                  range,
                )
              : Promise.resolve({ externalIds: new Set(), counts: new Map() }),
        });
        return {
          ...base,
          parsedRows: parsedPreview(parsed.outcomes, plan),
          counts: planCounts(plan),
          notTransactionRows: plan.notTransaction,
          errors: plan.errors.map((error) => ({
            rowNumber: error.rowNumber,
            cells: error.cells,
            message: error.message,
          })),
        };
      }),

    commit: propertyProcedure
      .input(
        z.object({
          csvText: csvTextSchema,
          fileName: z.string().trim().min(1).max(255),
          mapping: csvMappingSchema,
          headerRow: headerRowSchema.optional(),
          skipRows: z.array(headerRowSchema).max(10_000).default([]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const trackingStart = await trackingStartOf(ctx.propertyId);
        const rows = readCsv(input.csvText);
        checkHeaderRow(rows, input.headerRow);
        try {
          const { batch, plan } = await deps.unitOfWork.run(({ billing }) =>
            commitImport(billing, {
              propertyId: ctx.propertyId,
              fileName: input.fileName,
              rows,
              mapping: input.mapping,
              headerRow: input.headerRow,
              skipRows: input.skipRows,
              trackingStart,
              importedAt: new Date(),
              newId: randomUUID,
              hashRow: hashCsvRow,
            }),
          );
          return {
            ...batch,
            sortedCount: 0,
            zeroAmountCount: plan.zeroAmount.length,
            skippedRows: plan.errors.map((error) => error.rowNumber),
          };
        } catch (e) {
          throw toBadRequest(e, "Import failed");
        }
      }),

    listBatches: propertyProcedure.query(({ ctx }) =>
      deps.billingQueries.listImportBatches(ctx.propertyId),
    ),

    removeBatch: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deps.unitOfWork.run(({ billing }) =>
          removeImportBatch(billing, ctx.propertyId, input.id),
        );
        if (result === "notFound") throw notFound("Import not found");
        if (result === "sorted") {
          throw conflict(
            "Some transactions from this import are sorted. Unsort them before removing the import.",
          );
        }
        return { ok: true as const };
      }),
  });
}
