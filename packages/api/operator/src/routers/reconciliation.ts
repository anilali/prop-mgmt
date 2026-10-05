import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  BillingQueries,
  FinalizeStatement,
  ReconciliationYear,
  StatementRenderer,
} from "@moonship/billing";
import type { BlobStorage } from "@moonship/blob-storage";
import type { AccountQueries } from "@moonship/lease-mgmt";
import type { PropertyQueries, UnitQueries } from "@moonship/property";
import type { IsoDate } from "@moonship/shared";
import type { TenantQueries } from "@moonship/tenant-mgmt";
import {
  finalizeBlockers,
  finalizedYearView,
  finalizePlan,
  firstReconciliationYear,
  reconciliationWorkspace,
  snapshotFileName,
  yearEnd,
} from "@moonship/billing";
import { ConcurrentUpdateError } from "@moonship/shared";

import type { TransactionalStores, UnitOfWork } from "../unit-of-work";
import { saveAccount, toAccountTerms } from "../accounts";
import { badRequest, conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { isoDate, nonNegativeCentsSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

interface WorkspaceReaders {
  billingQueries: BillingQueries;
  accountQueries: AccountQueries;
  tenantQueries: TenantQueries;
  unitQueries: UnitQueries;
  propertyQueries: PropertyQueries;
}

export interface ReconciliationRouterDeps extends WorkspaceReaders {
  unitOfWork: UnitOfWork;
  statementRenderer: StatementRenderer;
  blobStorage: BlobStorage;
}

const DOWNLOAD_URL_SECONDS = 3600;

const yearSchema = z.number().int().min(2000).max(2100);

const yearInput = z.object({ year: yearSchema });

const poolInput = z.object({ year: yearSchema, poolId: z.string().uuid() });

const accountInput = z.object({
  year: yearSchema,
  accountId: z.string().uuid(),
});

function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

function assertDraft(record: ReconciliationYear): void {
  if (record.status === "finalized") {
    throw conflict(`${record.year} is finalized and can no longer change`);
  }
}

async function setEstimateSteps(
  stores: TransactionalStores,
  propertyId: string,
  statement: FinalizeStatement,
): Promise<void> {
  const account = await stores.accountRepository.findById(
    propertyId,
    statement.accountId,
  );
  if (!account) throw notFound("Account not found");
  try {
    for (const step of statement.estimateSteps) {
      account.setEstimateStep(
        step.leaseId,
        step.poolId,
        step.startsOn,
        step.amountCents,
        randomUUID(),
      );
    }
  } catch (e) {
    throw toBadRequest(e, "Could not set the new estimates");
  }
  await saveAccount(stores.accountRepository, account);
}

export function reconciliationRouter(deps: ReconciliationRouterDeps) {
  async function loadYearContext(
    readers: WorkspaceReaders,
    propertyId: string,
    year: number,
  ) {
    const { property, today } = await loadProperty(
      readers.propertyQueries,
      propertyId,
    );
    const trackingStart = property.trackingStartDate;
    if (trackingStart === null) {
      throw badRequest(
        "Set the tracking start date in Setup before opening a reconciliation",
      );
    }
    const firstYear = firstReconciliationYear(trackingStart);
    if (firstYear > yearOf(today)) {
      throw badRequest(
        `The first reconciliation is ${firstYear}, the first full year after the tracking start date`,
      );
    }
    if (year < firstYear || year > yearOf(today)) {
      throw badRequest(`Choose a year from ${firstYear} to ${yearOf(today)}`);
    }
    return { property, today, trackingStart };
  }

  async function loadWorkspace(
    readers: WorkspaceReaders,
    propertyId: string,
    year: number,
  ) {
    const { property, today, trackingStart } = await loadYearContext(
      readers,
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
      readers.accountQueries.list(propertyId),
      readers.tenantQueries.list(propertyId),
      readers.unitQueries.list(propertyId),
      readers.billingQueries.listPools(propertyId),
      readers.billingQueries.listCategories(propertyId),
      readers.billingQueries.listTransactions(propertyId),
      readers.billingQueries.listLedgerEntries(propertyId),
      readers.billingQueries.listReconciliationYears(propertyId),
      readers.billingQueries.listBillOverrides(propertyId),
    ]);
    return {
      trackingStart,
      transactions,
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
        finalizedYears: years
          .filter((record) => record.status === "finalized")
          .map((record) => record.year),
      }),
    };
  }

  async function loadPool(propertyId: string, poolId: string) {
    const pools = await deps.billingQueries.listPools(propertyId);
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) throw notFound("Pool not found");
    return pool;
  }

  async function finalizeYear(propertyId: string, year: number) {
    return deps.unitOfWork.run(
      async (stores) => {
        const record = await stores.billing.lockYear(propertyId, year);
        if (record.status === "finalized") {
          throw conflict(`${year} is already finalized`);
        }
        const { workspace } = await loadWorkspace(stores, propertyId, year);
        const blockers = finalizeBlockers(workspace);
        if (blockers.length > 0) {
          throw badRequest(
            `${year} cannot be finalized yet. ${blockers.join(" ")}`,
          );
        }
        const finalizedAt = new Date();
        const plan = finalizePlan({
          propertyId,
          record,
          workspace,
          createdAt: finalizedAt,
          newId: randomUUID,
        });
        for (const statement of plan.statements) {
          const pdf = await deps.statementRenderer.render(statement.data);
          await deps.blobStorage.putObject({
            key: statement.snapshot.pdfStorageKey,
            body: pdf,
            contentType: "application/pdf",
          });
          await stores.billing.insertStatementSnapshot(statement.snapshot);
          if (statement.trueUp) {
            await stores.billing.insertLedgerEntry(statement.trueUp);
          }
          if (statement.estimateSteps.length > 0) {
            await setEstimateSteps(stores, propertyId, statement);
          }
        }
        const saved = await stores.billing.saveYear({
          ...record,
          status: "finalized",
          letterDate: plan.letterDate,
          finalizedAt,
        });
        return {
          year: saved.year,
          status: saved.status,
          letterDate: plan.letterDate,
          finalizedAt,
          statements: plan.statements.map((statement) => ({
            accountId: statement.accountId,
            businessName: statement.businessName,
            unitLabel: statement.unitLabel,
            fileName: statement.fileName,
            trueUpCents: statement.snapshot.trueUpCents,
            balanceOnAccountCents: statement.snapshot.balanceOnAccountCents,
            newMonthlyRentCents:
              statement.data.continuing?.newMonthlyRentCents ?? null,
            newEstimateSteps: statement.estimateSteps.length,
          })),
        };
      },
      { isolationLevel: "repeatable read" },
    );
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
        const firstYear = firstReconciliationYear(trackingStart);
        for (let year = yearOf(today); year >= firstYear; year--) {
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
        const { trackingStart, workspace, transactions } = await loadWorkspace(
          deps,
          ctx.propertyId,
          input.year,
        );
        const finalized =
          workspace.status === "finalized"
            ? finalizedYearView({
                workspace,
                snapshots: await deps.billingQueries.listStatementSnapshots(
                  ctx.propertyId,
                ),
                transactions,
              })
            : null;
        return {
          ...workspace,
          trackingStart,
          isDryRun: workspace.priorBalanceAsOf < yearEnd(input.year),
          statements: workspace.statements.map(({ data, ...statement }) => ({
            ...statement,
            canPreview: data !== null,
          })),
          finalized,
        };
      }),

    finalize: propertyProcedure
      .input(yearInput)
      .mutation(async ({ ctx, input }) => {
        await loadYearContext(deps, ctx.propertyId, input.year);
        try {
          return await finalizeYear(ctx.propertyId, input.year);
        } catch (error) {
          if (!(error instanceof ConcurrentUpdateError)) throw error;
          const records = await deps.billingQueries.listReconciliationYears(
            ctx.propertyId,
          );
          const record = records.find((r) => r.year === input.year);
          if (record?.status === "finalized") {
            throw conflict(`${input.year} is already finalized`);
          }
          throw conflict(
            `Something changed while ${input.year} was being finalized. Try again.`,
          );
        }
      }),

    downloadUrl: propertyProcedure
      .input(accountInput)
      .mutation(async ({ ctx, input }) => {
        const snapshots = await deps.billingQueries.listStatementSnapshots(
          ctx.propertyId,
        );
        const snapshot = snapshots.find(
          (s) => s.year === input.year && s.accountId === input.accountId,
        );
        if (!snapshot) {
          throw notFound(
            `This account has no finalized statement for ${input.year}`,
          );
        }
        const fileName = snapshotFileName(snapshot);
        const url = await deps.blobStorage.getSignedDownloadUrl(
          snapshot.pdfStorageKey,
          { expiresInSeconds: DOWNLOAD_URL_SECONDS, fileName },
        );
        return { url, fileName, expiresInSeconds: DOWNLOAD_URL_SECONDS };
      }),

    setLetterDate: propertyProcedure
      .input(z.object({ year: yearSchema, letterDate: isoDate }))
      .mutation(async ({ ctx, input }) => {
        await loadYearContext(deps, ctx.propertyId, input.year);
        if (yearOf(input.letterDate) !== input.year + 1) {
          throw badRequest(
            `The letter date must be in ${input.year + 1}, the year after ${input.year}`,
          );
        }
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
        await loadYearContext(deps, ctx.propertyId, input.year);
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
        await loadYearContext(deps, ctx.propertyId, input.year);
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
      .input(accountInput)
      .mutation(async ({ ctx, input }) => {
        const { workspace } = await loadWorkspace(
          deps,
          ctx.propertyId,
          input.year,
        );
        if (workspace.status === "finalized") {
          throw badRequest(
            `${input.year} is finalized. Download the statement that was sent instead.`,
          );
        }
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
