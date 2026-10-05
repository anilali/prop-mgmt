import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  BillingQueries,
  ReconciliationYear,
  StatementRenderer,
} from "@moonship/billing";
import type { AccountQueries } from "@moonship/lease-mgmt";
import type { PropertyQueries, UnitQueries } from "@moonship/property";
import type { IsoDate } from "@moonship/shared";
import type { TenantQueries } from "@moonship/tenant-mgmt";
import { reconciliationWorkspace, yearEnd } from "@moonship/billing";

import type { UnitOfWork } from "../unit-of-work";
import { toAccountTerms } from "../accounts";
import { badRequest, conflict, notFound } from "../errors";
import { loadProperty } from "../property-context";
import { isoDate, nonNegativeCentsSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface ReconciliationRouterDeps {
  billingQueries: BillingQueries;
  accountQueries: AccountQueries;
  tenantQueries: TenantQueries;
  unitQueries: UnitQueries;
  propertyQueries: PropertyQueries;
  unitOfWork: UnitOfWork;
  statementRenderer: StatementRenderer;
}

const yearSchema = z.number().int().min(2000).max(2100);

const yearInput = z.object({ year: yearSchema });

const poolInput = z.object({ year: yearSchema, poolId: z.string().uuid() });

function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

function assertDraft(record: ReconciliationYear): void {
  if (record.status === "finalized") {
    throw conflict(`${record.year} is finalized and can no longer change`);
  }
}

export function reconciliationRouter(deps: ReconciliationRouterDeps) {
  async function loadYearContext(propertyId: string, year: number) {
    const { property, today } = await loadProperty(
      deps.propertyQueries,
      propertyId,
    );
    const trackingStart = property.trackingStartDate;
    if (trackingStart === null) {
      throw badRequest(
        "Set the tracking start date in Setup before opening a reconciliation",
      );
    }
    if (year < yearOf(trackingStart) || year > yearOf(today)) {
      throw badRequest(
        `Choose a year from ${yearOf(trackingStart)} to ${yearOf(today)}`,
      );
    }
    return { property, today, trackingStart };
  }

  async function loadWorkspace(propertyId: string, year: number) {
    const { property, today, trackingStart } = await loadYearContext(
      propertyId,
      year,
    );
    const [
      views,
      tenants,
      units,
      pools,
      categories,
      transactions,
      entries,
      years,
      overrides,
    ] = await Promise.all([
      deps.accountQueries.list(propertyId),
      deps.tenantQueries.list(propertyId),
      deps.unitQueries.list(propertyId),
      deps.billingQueries.listPools(propertyId),
      deps.billingQueries.listCategories(propertyId),
      deps.billingQueries.listTransactions(propertyId),
      deps.billingQueries.listLedgerEntries(propertyId),
      deps.billingQueries.listReconciliationYears(propertyId),
      deps.billingQueries.listBillOverrides(propertyId),
    ]);
    return {
      trackingStart,
      workspace: reconciliationWorkspace({
        year,
        today,
        trackingStart,
        propertyName: property.name,
        letter: property.letter,
        record: years.find((record) => record.year === year) ?? null,
        units: units.map((unit) => ({
          id: unit.id,
          label: unit.label,
          sqft: unit.sqft,
          sqftChangedOn: unit.sqftChangedOn,
          address: unit.address,
        })),
        tenants: tenants.map((tenant) => ({
          id: tenant.id,
          businessName: tenant.businessName,
          mailingAddress: tenant.mailingAddress ?? null,
        })),
        accounts: views.map(toAccountTerms),
        pools,
        categories,
        transactions,
        entries,
        overrides,
      }),
    };
  }

  async function loadPool(propertyId: string, poolId: string) {
    const pools = await deps.billingQueries.listPools(propertyId);
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) throw notFound("Pool not found");
    return pool;
  }

  return router({
    listYears: propertyProcedure.query(async ({ ctx }) => {
      const [{ property, today }, records] = await Promise.all([
        loadProperty(deps.propertyQueries, ctx.propertyId),
        deps.billingQueries.listReconciliationYears(ctx.propertyId),
      ]);
      const trackingStart = property.trackingStartDate;
      const years: number[] = [];
      if (trackingStart !== null) {
        for (let year = yearOf(today); year >= yearOf(trackingStart); year--) {
          years.push(year);
        }
      }
      return {
        today,
        trackingStart,
        years: years.map((year) => {
          const record = records.find((r) => r.year === year);
          return {
            year,
            status: record?.status ?? ("draft" as const),
            letterDate: record?.letterDate ?? null,
            finalizedAt: record?.finalizedAt ?? null,
          };
        }),
      };
    }),

    workspace: propertyProcedure
      .input(yearInput)
      .query(async ({ ctx, input }) => {
        const { trackingStart, workspace } = await loadWorkspace(
          ctx.propertyId,
          input.year,
        );
        return {
          ...workspace,
          trackingStart,
          isDryRun: workspace.priorBalanceAsOf < yearEnd(input.year),
          statements: workspace.statements.map(({ data, ...statement }) => ({
            ...statement,
            canPreview: data !== null,
          })),
        };
      }),

    setLetterDate: propertyProcedure
      .input(z.object({ year: yearSchema, letterDate: isoDate }))
      .mutation(async ({ ctx, input }) => {
        await loadYearContext(ctx.propertyId, input.year);
        return deps.unitOfWork.run(async (stores) => {
          const record = await stores.billing.lockYear(
            ctx.propertyId,
            input.year,
          );
          assertDraft(record);
          return stores.billing.saveYear({
            ...record,
            letterDate: input.letterDate,
          });
        });
      }),

    setBillOverride: propertyProcedure
      .input(
        poolInput.extend({
          amountCents: nonNegativeCentsSchema,
          note: z.string().trim().min(1).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await loadYearContext(ctx.propertyId, input.year);
        await loadPool(ctx.propertyId, input.poolId);
        return deps.unitOfWork.run(async (stores) => {
          const record = await stores.billing.lockYear(
            ctx.propertyId,
            input.year,
          );
          assertDraft(record);
          return stores.billing.saveBillOverride({
            id: randomUUID(),
            propertyId: ctx.propertyId,
            reconciliationYearId: record.id,
            year: input.year,
            poolId: input.poolId,
            amountCents: input.amountCents,
            note: input.note,
          });
        });
      }),

    clearBillOverride: propertyProcedure
      .input(poolInput)
      .mutation(async ({ ctx, input }) => {
        await loadYearContext(ctx.propertyId, input.year);
        await loadPool(ctx.propertyId, input.poolId);
        const records = await deps.billingQueries.listReconciliationYears(
          ctx.propertyId,
        );
        if (!records.some((record) => record.year === input.year)) {
          return { ok: true as const };
        }
        await deps.unitOfWork.run(async (stores) => {
          const record = await stores.billing.lockYear(
            ctx.propertyId,
            input.year,
          );
          assertDraft(record);
          await stores.billing.deleteBillOverride(
            ctx.propertyId,
            record.id,
            input.poolId,
          );
        });
        return { ok: true as const };
      }),

    previewPdf: propertyProcedure
      .input(z.object({ year: yearSchema, accountId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { workspace } = await loadWorkspace(ctx.propertyId, input.year);
        const statement = workspace.statements.find(
          (s) => s.accountId === input.accountId,
        );
        if (!statement) {
          throw notFound(`This account has no statement for ${input.year}`);
        }
        if (!statement.data) {
          throw badRequest(
            "A pool on this statement has no units. Add its units in Setup before previewing.",
          );
        }
        const pdf = await deps.statementRenderer.render(statement.data);
        return {
          fileName: statement.fileName,
          base64: Buffer.from(pdf).toString("base64"),
        };
      }),
  });
}
