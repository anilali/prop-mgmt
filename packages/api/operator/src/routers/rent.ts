import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  AccountLedger,
  BillingQueries,
  BillingStore,
  LateFeeSuggestion,
} from "@moonship/billing";
import type { AccountQueries } from "@moonship/lease-mgmt";
import type { PropertyQueries, UnitQueries } from "@moonship/property";
import type { IsoDate, YearMonth } from "@moonship/shared";
import type { TenantQueries } from "@moonship/tenant-mgmt";
import {
  DuplicateLedgerEntryError,
  entryDateFor,
  historyRows,
  isInFinalizedYear,
  isLateFeeDecided,
  lateFeeEntryDate,
  lateFeeSuggestions,
} from "@moonship/billing";

import { badRequest, conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import {
  loadRentData,
  newestBankDate,
  rentStatusRows,
  rentSummary,
} from "../rent-data";
import { centsSchema, isoDate, yearMonth } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface RentRouterDeps {
  billingStore: BillingStore;
  billingQueries: BillingQueries;
  accountQueries: AccountQueries;
  tenantQueries: TenantQueries;
  unitQueries: UnitQueries;
  propertyQueries: PropertyQueries;
}

const adjustmentFields = {
  date: isoDate,
  amountCents: centsSchema.refine((value) => value !== 0, {
    message: "Enter an amount other than 0",
  }),
  note: z.string().trim().min(1).max(500),
};

const lateFeeInput = z.object({
  accountId: z.string().uuid(),
  month: yearMonth,
});

function currentSuggestion(
  ledger: AccountLedger,
  month: YearMonth,
  today: IsoDate,
): LateFeeSuggestion {
  if (isLateFeeDecided(ledger, month)) {
    throw conflict(
      "The late fee for this month was already approved or dismissed",
    );
  }
  const suggestion = lateFeeSuggestions(ledger, today).find(
    (s) => s.month === month,
  );
  if (!suggestion) {
    throw conflict("There is no late fee to decide for this month");
  }
  return suggestion;
}

export function rentRouter(deps: RentRouterDeps) {
  async function loadLedger(propertyId: string, accountId: string) {
    const data = await loadRentData(deps, propertyId);
    const view = data.views.find((v) => v.id === accountId);
    if (!view) throw notFound("Account not found");
    return { today: data.today, ledger: data.ledgerOf(view) };
  }

  async function loadEntry(propertyId: string, id: string) {
    const entry = await deps.billingQueries.getLedgerEntry(propertyId, id);
    if (!entry) throw notFound("Entry not found");
    return entry;
  }

  function checkAdjustmentDate(
    trackingStart: IsoDate | null,
    today: IsoDate,
    date: IsoDate,
  ) {
    if (trackingStart === null) {
      throw badRequest(
        "Set the tracking start date in Setup before adding adjustments",
      );
    }
    if (date < trackingStart) {
      throw badRequest(
        `The date is before the tracking start date, ${trackingStart}`,
      );
    }
    if (date > today) {
      throw badRequest(`The date is after today, ${today}`);
    }
  }

  async function save<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof DuplicateLedgerEntryError) {
        throw conflict(error.message);
      }
      throw toBadRequest(error, "Invalid entry");
    }
  }

  return router({
    status: propertyProcedure.query(async ({ ctx }) => {
      const data = await loadRentData(deps, ctx.propertyId);
      return {
        today: data.today,
        trackingStart: data.property.trackingStartDate,
        newestBankDate: newestBankDate(data.transactions),
        rows: rentStatusRows(data),
      };
    }),

    history: propertyProcedure
      .input(z.object({ accountId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [data, pools, finalizedYears] = await Promise.all([
          loadRentData(deps, ctx.propertyId),
          deps.billingQueries.listPools(ctx.propertyId),
          deps.billingQueries.listFinalizedYears(ctx.propertyId),
        ]);
        const view = data.views.find((v) => v.id === input.accountId);
        if (!view) throw notFound("Account not found");
        const ledger = data.ledgerOf(view);
        const poolName = (poolId: string) =>
          pools.find((pool) => pool.id === poolId)?.name ?? "";
        return {
          today: data.today,
          trackingStart: data.property.trackingStartDate,
          newestBankDate: newestBankDate(data.transactions),
          account: data.accountOf(view),
          ...rentSummary(ledger, data.today),
          rows: historyRows(ledger, data.today).map((row) => {
            switch (row.kind) {
              case "opening":
              case "payment":
                return row;
              case "month":
                return {
                  ...row,
                  estimates: row.estimates.map((estimate) => ({
                    ...estimate,
                    poolName: poolName(estimate.poolId),
                  })),
                };
              default:
                return {
                  ...row,
                  locked:
                    row.kind === "true_up" ||
                    isInFinalizedYear(row.date, finalizedYears),
                };
            }
          }),
        };
      }),

    addAdjustment: propertyProcedure
      .input(z.object({ accountId: z.string().uuid(), ...adjustmentFields }))
      .mutation(async ({ ctx, input }) => {
        const [{ property, today }, account, finalizedYears] =
          await Promise.all([
            loadProperty(deps.propertyQueries, ctx.propertyId),
            deps.accountQueries.getById(ctx.propertyId, input.accountId),
            deps.billingQueries.listFinalizedYears(ctx.propertyId),
          ]);
        if (!account) throw notFound("Account not found");
        const { entryDate, movedFrom } = entryDateFor(
          input.date,
          today,
          finalizedYears,
        );
        checkAdjustmentDate(property.trackingStartDate, today, entryDate);
        const entry = await save(() =>
          deps.billingStore.insertLedgerEntry({
            id: randomUUID(),
            propertyId: ctx.propertyId,
            accountId: account.id,
            kind: "adjustment",
            entryDate,
            amountCents: input.amountCents,
            note: input.note,
            feeMonth: null,
            reconciliationYearId: null,
          }),
        );
        return { entry, movedFrom };
      }),

    updateAdjustment: propertyProcedure
      .input(z.object({ id: z.string().uuid(), ...adjustmentFields }))
      .mutation(async ({ ctx, input }) => {
        const [{ property, today }, existing, finalizedYears] =
          await Promise.all([
            loadProperty(deps.propertyQueries, ctx.propertyId),
            loadEntry(ctx.propertyId, input.id),
            deps.billingQueries.listFinalizedYears(ctx.propertyId),
          ]);
        if (existing.kind !== "adjustment") {
          throw badRequest("Only an adjustment can be edited");
        }
        if (
          isInFinalizedYear(existing.entryDate, finalizedYears) ||
          isInFinalizedYear(input.date, finalizedYears)
        ) {
          throw conflict(
            "This date is in a finalized year. Add a new adjustment instead.",
          );
        }
        checkAdjustmentDate(property.trackingStartDate, today, input.date);
        const entry = await save(() =>
          deps.billingStore.updateLedgerEntry({
            ...existing,
            entryDate: input.date,
            amountCents: input.amountCents,
            note: input.note,
          }),
        );
        if (!entry) throw notFound("Entry not found");
        return entry;
      }),

    removeEntry: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const [entry, finalizedYears] = await Promise.all([
          loadEntry(ctx.propertyId, input.id),
          deps.billingQueries.listFinalizedYears(ctx.propertyId),
        ]);
        if (entry.kind === "true_up") {
          throw conflict("A true-up comes from finalize and cannot be removed");
        }
        if (isInFinalizedYear(entry.entryDate, finalizedYears)) {
          throw conflict(
            "This entry is in a finalized year. Add an adjustment instead.",
          );
        }
        const removed = await deps.billingStore.deleteLedgerEntry(
          ctx.propertyId,
          entry.id,
        );
        if (!removed) throw notFound("Entry not found");
        return { ok: true as const };
      }),
    approveLateFee: propertyProcedure
      .input(lateFeeInput)
      .mutation(async ({ ctx, input }) => {
        const [{ today, ledger }, finalizedYears] = await Promise.all([
          loadLedger(ctx.propertyId, input.accountId),
          deps.billingQueries.listFinalizedYears(ctx.propertyId),
        ]);
        const suggestion = currentSuggestion(ledger, input.month, today);
        const { entryDate, movedFrom } = lateFeeEntryDate(
          suggestion,
          today,
          finalizedYears,
        );
        const entry = await save(() =>
          deps.billingStore.insertLedgerEntry({
            id: randomUUID(),
            propertyId: ctx.propertyId,
            accountId: input.accountId,
            kind: "late_fee",
            entryDate,
            amountCents: suggestion.amountCents,
            note: null,
            feeMonth: suggestion.month,
            reconciliationYearId: null,
          }),
        );
        return { entry, movedFrom };
      }),

    dismissLateFee: propertyProcedure
      .input(lateFeeInput)
      .mutation(async ({ ctx, input }) => {
        const { today, ledger } = await loadLedger(
          ctx.propertyId,
          input.accountId,
        );
        const suggestion = currentSuggestion(ledger, input.month, today);
        const entry = await save(() =>
          deps.billingStore.insertLedgerEntry({
            id: randomUUID(),
            propertyId: ctx.propertyId,
            accountId: input.accountId,
            kind: "late_fee_dismissed",
            entryDate: today,
            amountCents: 0,
            note: null,
            feeMonth: suggestion.month,
            reconciliationYearId: null,
          }),
        );
        return { entry };
      }),
  });
}
