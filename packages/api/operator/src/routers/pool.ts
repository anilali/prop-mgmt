import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  BillingQueries,
  BillingStore,
  Category,
  Pool,
} from "@moonship/billing";
import type { AccountQueries } from "@moonship/lease-mgmt";
import type {
  PropertyQueries,
  UnitQueries,
  UnitView,
} from "@moonship/property";
import {
  accountState,
  cleanName,
  paysPool,
  poolShareTable,
  sharedCostCategory,
} from "@moonship/billing";

import type { UnitOfWork } from "../unit-of-work";
import { toAccountTerms } from "../accounts";
import { badRequest, conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { propertyProcedure, router } from "../trpc";

export interface PoolRouterDeps {
  billingStore: BillingStore;
  billingQueries: BillingQueries;
  unitQueries: UnitQueries;
  accountQueries: AccountQueries;
  propertyQueries: PropertyQueries;
  unitOfWork: UnitOfWork;
}

const nameSchema = z.string().trim().min(1).max(64);
const unitIdsSchema = z.array(z.string().uuid());

function toPoolView(pool: Pool, categories: Category[], units: UnitView[]) {
  const table = poolShareTable(pool.unitIds, units);
  return {
    id: pool.id,
    name: pool.name,
    letterName: pool.letterName,
    addsNewUnits: pool.addsNewUnits,
    sortOrder: pool.sortOrder,
    membersChangedOn: pool.membersChangedOn,
    categoryId: categories.find((c) => c.poolId === pool.id)?.id ?? null,
    totalSqft: table.totalSqft,
    units: table.rows.map((row) => ({
      unitId: row.unitId,
      label: units.find((u) => u.id === row.unitId)?.label ?? "",
      sqft: row.sqft,
      shareBps: row.shareBps,
    })),
  };
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function poolRouter(deps: PoolRouterDeps) {
  async function changeDate(propertyId: string) {
    if (!(await deps.billingQueries.hasTransactions(propertyId))) return null;
    const { today } = await loadProperty(deps.propertyQueries, propertyId);
    return today;
  }

  async function loadPool(propertyId: string, id: string) {
    const pools = await deps.billingQueries.listPools(propertyId);
    const pool = pools.find((p) => p.id === id);
    if (!pool) throw notFound("Pool not found");
    return { pool, pools };
  }

  async function assertUnits(propertyId: string, unitIds: string[]) {
    const units = await deps.unitQueries.list(propertyId);
    for (const unitId of unitIds) {
      if (!units.some((u) => u.id === unitId)) {
        throw badRequest(`Unit not found: ${unitId}`);
      }
    }
    return [...new Set(unitIds)];
  }

  async function assertNameFree(
    propertyId: string,
    name: string,
    poolId: string | null,
  ) {
    const [pools, categories] = await Promise.all([
      deps.billingQueries.listPools(propertyId),
      deps.billingQueries.listCategories(propertyId),
    ]);
    if (
      pools.some((p) => p.name === name && p.id !== poolId) ||
      categories.some(
        (c) => c.name === name && (poolId === null || c.poolId !== poolId),
      )
    ) {
      throw conflict(`A pool or category named ${name} already exists`);
    }
  }

  async function getPool(propertyId: string, id: string) {
    const [pools, categories, units] = await Promise.all([
      deps.billingQueries.listPools(propertyId),
      deps.billingQueries.listCategories(propertyId),
      deps.unitQueries.list(propertyId),
    ]);
    const pool = pools.find((p) => p.id === id);
    if (!pool) throw notFound("Pool not found");
    return toPoolView(pool, categories, units);
  }

  function cleanPoolNames(input: { name?: string; letterName?: string }) {
    try {
      return {
        name:
          input.name !== undefined ? cleanName(input.name, "Name") : undefined,
        letterName:
          input.letterName !== undefined
            ? cleanName(input.letterName, "Letter name")
            : undefined,
      };
    } catch (e) {
      throw toBadRequest(e, "Invalid pool");
    }
  }

  return router({
    list: propertyProcedure.query(async ({ ctx }) => {
      const [pools, categories, units] = await Promise.all([
        deps.billingQueries.listPools(ctx.propertyId),
        deps.billingQueries.listCategories(ctx.propertyId),
        deps.unitQueries.list(ctx.propertyId),
      ]);
      return pools.map((pool) => toPoolView(pool, categories, units));
    }),

    create: propertyProcedure
      .input(
        z.object({
          name: nameSchema,
          letterName: nameSchema,
          unitIds: unitIdsSchema,
          addsNewUnits: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const names = cleanPoolNames(input);
        const name = names.name ?? input.name;
        await assertNameFree(ctx.propertyId, name, null);
        const unitIds = await assertUnits(ctx.propertyId, input.unitIds);
        const pools = await deps.billingQueries.listPools(ctx.propertyId);
        const pool: Pool = {
          id: randomUUID(),
          propertyId: ctx.propertyId,
          name,
          letterName: names.letterName ?? input.letterName,
          addsNewUnits: input.addsNewUnits,
          sortOrder: Math.max(-1, ...pools.map((p) => p.sortOrder)) + 1,
          membersChangedOn:
            unitIds.length > 0 ? await changeDate(ctx.propertyId) : null,
          unitIds,
        };
        await deps.unitOfWork.run(async (stores) => {
          await stores.billing.savePool(pool);
          await stores.billing.saveCategory(
            sharedCostCategory(pool, randomUUID()),
          );
        });
        return getPool(ctx.propertyId, pool.id);
      }),

    update: propertyProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          name: nameSchema.optional(),
          letterName: nameSchema.optional(),
          addsNewUnits: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { pool } = await loadPool(ctx.propertyId, input.id);
        const names = cleanPoolNames(input);
        if (names.name !== undefined) {
          await assertNameFree(ctx.propertyId, names.name, pool.id);
        }
        const updated: Pool = {
          ...pool,
          name: names.name ?? pool.name,
          letterName: names.letterName ?? pool.letterName,
          addsNewUnits: input.addsNewUnits ?? pool.addsNewUnits,
        };
        const categories = await deps.billingQueries.listCategories(
          ctx.propertyId,
        );
        const category = categories.find((c) => c.poolId === pool.id);
        await deps.unitOfWork.run(async (stores) => {
          await stores.billing.savePool(updated);
          if (category && category.name !== updated.name) {
            await stores.billing.saveCategory({
              ...category,
              name: updated.name,
            });
          }
        });
        return getPool(ctx.propertyId, pool.id);
      }),

    setUnits: propertyProcedure
      .input(z.object({ id: z.string().uuid(), unitIds: unitIdsSchema }))
      .mutation(async ({ ctx, input }) => {
        const { pool } = await loadPool(ctx.propertyId, input.id);
        const unitIds = await assertUnits(ctx.propertyId, input.unitIds);
        const removed = pool.unitIds.filter((id) => !unitIds.includes(id));
        if (removed.length > 0) {
          const { today } = await loadProperty(
            deps.propertyQueries,
            ctx.propertyId,
          );
          const accounts = await deps.accountQueries.list(ctx.propertyId);
          const blocking = accounts.find((account) => {
            if (!removed.includes(account.unitId)) return false;
            const terms = toAccountTerms(account);
            return (
              accountState(terms, today) !== "closed" &&
              terms.leases.some((lease) => paysPool(lease, pool.id))
            );
          });
          if (blocking) {
            throw conflict(
              `A current or upcoming account on a removed unit pays ${pool.name}. Remove its ${pool.name} estimates first.`,
            );
          }
        }
        if (!sameMembers(pool.unitIds, unitIds)) {
          const changedOn = await changeDate(ctx.propertyId);
          await deps.billingStore.savePool({
            ...pool,
            unitIds,
            membersChangedOn: changedOn ?? pool.membersChangedOn,
          });
        }
        return getPool(ctx.propertyId, pool.id);
      }),

    remove: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { pool } = await loadPool(ctx.propertyId, input.id);
        const accounts = await deps.accountQueries.list(ctx.propertyId);
        const usedByLease = accounts.some((account) =>
          account.leases.some((lease) =>
            lease.estimateSteps.some((step) => step.poolId === pool.id),
          ),
        );
        if (usedByLease) {
          throw conflict(`A lease has ${pool.name} estimates`);
        }
        const categories = await deps.billingQueries.listCategories(
          ctx.propertyId,
        );
        const category = categories.find((c) => c.poolId === pool.id);
        if (
          category &&
          (await deps.billingQueries.categoryHasAllocations(
            ctx.propertyId,
            category.id,
          ))
        ) {
          throw conflict(`Transactions are sorted to ${pool.name}`);
        }
        const overrides = await deps.billingQueries.listBillOverrides(
          ctx.propertyId,
        );
        if (overrides.some((override) => override.poolId === pool.id)) {
          throw conflict(
            `A reconciliation year has a ${pool.name} bill amount`,
          );
        }
        await deps.billingStore.deletePool(ctx.propertyId, pool.id);
        return { ok: true as const };
      }),
  });
}
