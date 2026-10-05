import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  AccountLedger,
  AccountState,
  BillingQueries,
  BillingStore,
  Txn,
} from "@moonship/billing";
import type { AccountQueries, AccountView } from "@moonship/lease-mgmt";
import type { PropertyQueries, UnitQueries } from "@moonship/property";
import type { IsoDate } from "@moonship/shared";
import type { TenantQueries } from "@moonship/tenant-mgmt";
import {
  accountBalance,
  accountEnd,
  accountEntries,
  accountPayments,
  accountStart,
  accountState,
  compareRentStatus,
  DuplicateLedgerEntryError,
  entryDateFor,
  historyRows,
  isInFinalizedYear,
  rentStatus,
} from "@moonship/billing";

import { toAccountTerms } from "../accounts";
import { badRequest, conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { centsSchema, isoDate } from "../schemas";
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

export interface RentAccount {
  id: string;
  tenant: { id: string; businessName: string };
  unit: { id: string; label: string };
  state: AccountState;
  openingBalanceCents: number;
  startDate: IsoDate;
  endDate: IsoDate | null;
}

function newestBankDate(transactions: readonly Txn[]): IsoDate | null {
  let newest: IsoDate | null = null;
  for (const txn of transactions) {
    if (txn.source === "bank" && (newest === null || txn.postedOn > newest)) {
      newest = txn.postedOn;
    }
  }
  return newest;
}

export function rentRouter(deps: RentRouterDeps) {
  async function loadRentData(propertyId: string) {
    const [{ property, today }, views, tenants, units, transactions, entries] =
      await Promise.all([
        loadProperty(deps.propertyQueries, propertyId),
        deps.accountQueries.list(propertyId),
        deps.tenantQueries.list(propertyId),
        deps.unitQueries.list(propertyId),
        deps.billingQueries.listTransactions(propertyId),
        deps.billingQueries.listLedgerEntries(propertyId),
      ]);

    function accountOf(view: AccountView): RentAccount {
      const terms = toAccountTerms(view);
      const tenant = tenants.find((t) => t.id === view.tenantId);
      const unit = units.find((u) => u.id === view.unitId);
      return {
        id: view.id,
        tenant: { id: view.tenantId, businessName: tenant?.businessName ?? "" },
        unit: { id: view.unitId, label: unit?.label ?? "" },
        state: accountState(terms, today),
        openingBalanceCents: view.openingBalanceCents,
        startDate: accountStart(terms),
        endDate: accountEnd(terms),
      };
    }

    function ledgerOf(view: AccountView): AccountLedger {
      return {
        account: toAccountTerms(view),
        trackingStart: property.trackingStartDate,
        payments: accountPayments(transactions, view.id),
        entries: accountEntries(entries, view.id),
      };
    }

    return {
      property,
      today,
      views,
      transactions,
      accountOf,
      ledgerOf,
    };
  }

  function summaryOf(ledger: AccountLedger, today: IsoDate) {
    return {
      ...accountBalance(ledger, today),
      status: rentStatus(ledger, today),
    };
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
      const data = await loadRentData(ctx.propertyId);
      const rows = data.views
        .map((view) => {
          const account = data.accountOf(view);
          return {
            accountId: account.id,
            tenant: account.tenant,
            unit: account.unit,
            state: account.state,
            ...summaryOf(data.ledgerOf(view), data.today),
          };
        })
        .filter(
          (row) =>
            row.state === "open" ||
            row.state === "holdover" ||
            row.balanceCents !== 0,
        )
        .sort(
          (a, b) =>
            compareRentStatus(a, b) ||
            a.unit.label.localeCompare(b.unit.label, undefined, {
              numeric: true,
            }),
        );
      return {
        today: data.today,
        trackingStart: data.property.trackingStartDate,
        newestBankDate: newestBankDate(data.transactions),
        rows,
      };
    }),

    history: propertyProcedure
      .input(z.object({ accountId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [data, pools, finalizedYears] = await Promise.all([
          loadRentData(ctx.propertyId),
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
          ...summaryOf(ledger, data.today),
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
  });
}
