import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  AllocationLine,
  BillingQueries,
  CashExpense,
  Txn,
} from "@moonship/billing";
import type { AccountQueries } from "@moonship/lease-mgmt";
import type { PropertyQueries } from "@moonship/property";
import { checkAllocationLines, suggestionFor } from "@moonship/billing";

import type { UnitOfWork } from "../unit-of-work";
import { toAccountTerms } from "../accounts";
import { badRequest, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { centsSchema, isoDate } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface TransactionRouterDeps {
  billingQueries: BillingQueries;
  accountQueries: AccountQueries;
  propertyQueries: PropertyQueries;
  unitOfWork: UnitOfWork;
}

const idInput = z.object({ id: z.string().uuid() });

const lineSchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  amountCents: centsSchema,
});

const cashInputSchema = z.object({
  date: isoDate,
  description: z.string().trim().min(1).max(500),
  amountCents: centsSchema.positive(),
  categoryId: z.string().uuid(),
});

function newestFirst(a: Txn, b: Txn): number {
  return a.postedOn === b.postedOn ? 0 : a.postedOn < b.postedOn ? 1 : -1;
}

export function transactionRouter(deps: TransactionRouterDeps) {
  async function loadTransaction(propertyId: string, id: string) {
    const txn = await deps.billingQueries.getTransaction(propertyId, id);
    if (!txn) throw notFound("Transaction not found");
    return txn;
  }

  async function assertTargets(propertyId: string, lines: AllocationLine[]) {
    const accountIds = lines.flatMap((l) => (l.accountId ? [l.accountId] : []));
    const categoryIds = lines.flatMap((l) =>
      l.categoryId ? [l.categoryId] : [],
    );
    if (accountIds.length > 0) {
      const accounts = await deps.accountQueries.list(propertyId);
      for (const accountId of accountIds) {
        if (!accounts.some((a) => a.id === accountId)) {
          throw badRequest(`Account not found: ${accountId}`);
        }
      }
    }
    if (categoryIds.length > 0) {
      const categories = await deps.billingQueries.listCategories(propertyId);
      for (const categoryId of categoryIds) {
        if (!categories.some((c) => c.id === categoryId)) {
          throw badRequest(`Category not found: ${categoryId}`);
        }
      }
    }
  }

  async function toCashExpense(
    propertyId: string,
    id: string,
    input: z.infer<typeof cashInputSchema>,
  ): Promise<CashExpense> {
    const { property } = await loadProperty(deps.propertyQueries, propertyId);
    if (property.trackingStartDate === null) {
      throw badRequest(
        "Set the tracking start date in Setup before adding cash expenses",
      );
    }
    if (input.date < property.trackingStartDate) {
      throw badRequest(
        `The date is before the tracking start date, ${property.trackingStartDate}`,
      );
    }
    await assertTargets(propertyId, [
      { accountId: null, categoryId: input.categoryId, amountCents: -1 },
    ]);
    return {
      id,
      propertyId,
      postedOn: input.date,
      description: input.description,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
    };
  }

  function rejectCash(txn: Txn) {
    if (txn.source === "cash") {
      throw badRequest(
        "A cash expense has one category. Edit the cash expense instead.",
      );
    }
  }

  return router({
    listToSort: propertyProcedure.query(async ({ ctx }) => {
      const [{ property }, transactions, accounts, categories] =
        await Promise.all([
          loadProperty(deps.propertyQueries, ctx.propertyId),
          deps.billingQueries.listTransactions(ctx.propertyId),
          deps.accountQueries.list(ctx.propertyId),
          deps.billingQueries.listCategories(ctx.propertyId),
        ]);
      const context = {
        transactions,
        accounts: accounts.map(toAccountTerms),
        categories,
        trackingStart: property.trackingStartDate,
      };
      return transactions
        .filter((txn) => txn.lines.length === 0)
        .sort(newestFirst)
        .map((txn) => ({ ...txn, suggestion: suggestionFor(txn, context) }));
    }),

    list: propertyProcedure
      .input(
        z
          .object({
            year: z.number().int().min(1900).max(9999).optional(),
            categoryId: z.string().uuid().optional(),
            accountId: z.string().uuid().optional(),
            search: z.string().trim().max(255).optional(),
            sorted: z.boolean().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const filters = input ?? {};
        const search = filters.search?.toLowerCase() ?? "";
        const lineFilter =
          filters.categoryId !== undefined || filters.accountId !== undefined;
        const matches = (line: AllocationLine) =>
          (filters.categoryId === undefined ||
            line.categoryId === filters.categoryId) &&
          (filters.accountId === undefined ||
            line.accountId === filters.accountId);

        const transactions = await deps.billingQueries.listTransactions(
          ctx.propertyId,
        );
        const rows = transactions
          .filter(
            (txn) =>
              (filters.year === undefined ||
                txn.postedOn.startsWith(`${filters.year}-`)) &&
              (search === "" ||
                txn.description.toLowerCase().includes(search)) &&
              (filters.sorted === undefined ||
                txn.lines.length > 0 === filters.sorted) &&
              (!lineFilter || txn.lines.some(matches)),
          )
          .sort(newestFirst)
          .map((txn) => ({
            ...txn,
            matchedCents: lineFilter
              ? txn.lines
                  .filter(matches)
                  .reduce((sum, line) => sum + line.amountCents, 0)
              : txn.amountCents,
          }));
        return {
          rows,
          totalCents: rows.reduce((sum, row) => sum + row.matchedCents, 0),
        };
      }),

    get: propertyProcedure
      .input(idInput)
      .query(({ ctx, input }) => loadTransaction(ctx.propertyId, input.id)),

    allocate: propertyProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          lines: z.array(lineSchema).min(1).max(50),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const txn = await loadTransaction(ctx.propertyId, input.id);
        rejectCash(txn);
        const lines: AllocationLine[] = input.lines.map((line) => ({
          accountId: line.accountId ?? null,
          categoryId: line.categoryId ?? null,
          amountCents: line.amountCents,
        }));
        try {
          checkAllocationLines(txn.amountCents, lines);
        } catch (e) {
          throw toBadRequest(e, "Invalid lines");
        }
        await assertTargets(ctx.propertyId, lines);
        const saved = await deps.unitOfWork.run(({ billing }) =>
          billing.replaceAllocations(ctx.propertyId, txn.id, lines),
        );
        if (!saved) throw notFound("Transaction not found");
        return saved;
      }),

    unsort: propertyProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        const txn = await loadTransaction(ctx.propertyId, input.id);
        rejectCash(txn);
        const saved = await deps.unitOfWork.run(({ billing }) =>
          billing.replaceAllocations(ctx.propertyId, txn.id, []),
        );
        if (!saved) throw notFound("Transaction not found");
        return saved;
      }),

    createCash: propertyProcedure
      .input(cashInputSchema)
      .mutation(async ({ ctx, input }) => {
        const expense = await toCashExpense(
          ctx.propertyId,
          randomUUID(),
          input,
        );
        return deps.unitOfWork.run(({ billing }) =>
          billing.insertCashExpense(expense),
        );
      }),

    updateCash: propertyProcedure
      .input(cashInputSchema.extend({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const txn = await loadTransaction(ctx.propertyId, input.id);
        if (txn.source !== "cash") {
          throw badRequest("Only a cash expense can be edited");
        }
        const expense = await toCashExpense(ctx.propertyId, txn.id, input);
        const saved = await deps.unitOfWork.run(({ billing }) =>
          billing.updateCashExpense(expense),
        );
        if (!saved) throw notFound("Cash expense not found");
        return saved;
      }),

    removeCash: propertyProcedure
      .input(idInput)
      .mutation(async ({ ctx, input }) => {
        const txn = await loadTransaction(ctx.propertyId, input.id);
        if (txn.source !== "cash") {
          throw badRequest(
            "Bank rows are removed with their import, not one at a time",
          );
        }
        const removed = await deps.unitOfWork.run(({ billing }) =>
          billing.deleteCashExpense(ctx.propertyId, txn.id),
        );
        if (!removed) throw notFound("Cash expense not found");
        return { ok: true as const };
      }),
  });
}
