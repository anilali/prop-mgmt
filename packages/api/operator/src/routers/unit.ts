import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BillingQueries, Pool } from "@moonship/billing";
import type { AccountQueries } from "@moonship/lease-mgmt";
import type {
  PropertyQueries,
  UnitQueries,
  UnitRepository,
  UnitView,
} from "@moonship/property";
import { Unit } from "@moonship/property";

import type { UnitOfWork } from "../unit-of-work";
import { conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { addressSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface UnitRouterDeps {
  unitRepository: UnitRepository;
  unitQueries: UnitQueries;
  propertyQueries: PropertyQueries;
  accountQueries: AccountQueries;
  billingQueries: BillingQueries;
  unitOfWork: UnitOfWork;
}

const labelSchema = z.string().trim().min(1).max(64);
const sqftSchema = z.number().int().positive();

function withPoolIds(unit: UnitView, pools: Pool[]) {
  return {
    ...unit,
    poolIds: pools
      .filter((pool) => pool.unitIds.includes(unit.id))
      .map((pool) => pool.id),
  };
}

export function unitRouter(deps: UnitRouterDeps) {
  async function changeDate(propertyId: string) {
    if (!(await deps.billingQueries.hasTransactions(propertyId))) return null;
    const { today } = await loadProperty(deps.propertyQueries, propertyId);
    return today;
  }

  async function assertLabelFree(
    propertyId: string,
    label: string,
    unitId: string | null,
  ) {
    const units = await deps.unitQueries.list(propertyId);
    if (units.some((u) => u.label === label.trim() && u.id !== unitId)) {
      throw conflict(`A unit labeled ${label.trim()} already exists`);
    }
  }

  async function getUnit(propertyId: string, id: string) {
    const [unit, pools] = await Promise.all([
      deps.unitQueries.getById(propertyId, id),
      deps.billingQueries.listPools(propertyId),
    ]);
    if (!unit) throw notFound("Unit not found");
    return withPoolIds(unit, pools);
  }

  return router({
    list: propertyProcedure.query(async ({ ctx }) => {
      const [units, pools] = await Promise.all([
        deps.unitQueries.list(ctx.propertyId),
        deps.billingQueries.listPools(ctx.propertyId),
      ]);
      return units.map((unit) => withPoolIds(unit, pools));
    }),

    get: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(({ ctx, input }) => getUnit(ctx.propertyId, input.id)),

    create: propertyProcedure
      .input(
        z.object({
          label: labelSchema,
          sqft: sqftSchema,
          address: addressSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertLabelFree(ctx.propertyId, input.label, null);
        let unit: Unit;
        try {
          unit = Unit.create({
            id: randomUUID(),
            propertyId: ctx.propertyId,
            label: input.label,
            sqft: input.sqft,
            address: input.address,
          });
        } catch (e) {
          throw toBadRequest(e, "Create failed");
        }
        const changedOn = await changeDate(ctx.propertyId);
        await deps.unitOfWork.run(async (stores) => {
          await stores.unitRepository.save(unit);
          const pools = await stores.billing.listPools(ctx.propertyId);
          for (const pool of pools.filter((p) => p.addsNewUnits)) {
            await stores.billing.savePool({
              ...pool,
              unitIds: [...pool.unitIds, unit.id],
              membersChangedOn: changedOn ?? pool.membersChangedOn,
            });
          }
        });
        return getUnit(ctx.propertyId, unit.id);
      }),

    update: propertyProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          label: labelSchema.optional(),
          sqft: sqftSchema.optional(),
          address: addressSchema.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const unit = await deps.unitRepository.findById(
          ctx.propertyId,
          input.id,
        );
        if (!unit) throw notFound("Unit not found");
        if (input.label !== undefined) {
          await assertLabelFree(ctx.propertyId, input.label, unit.id);
        }
        const changedOn =
          input.sqft !== undefined && input.sqft !== unit.sqft
            ? await changeDate(ctx.propertyId)
            : null;
        try {
          unit.updateDetails(
            { label: input.label, sqft: input.sqft, address: input.address },
            changedOn,
          );
        } catch (e) {
          throw toBadRequest(e, "Update failed");
        }
        await deps.unitRepository.save(unit);
        return getUnit(ctx.propertyId, unit.id);
      }),

    remove: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const unit = await deps.unitQueries.getById(ctx.propertyId, input.id);
        if (!unit) throw notFound("Unit not found");
        const accounts = await deps.accountQueries.list(ctx.propertyId);
        if (accounts.some((account) => account.unitId === input.id)) {
          throw conflict("Cannot remove a unit that has an account");
        }
        const changedOn = await changeDate(ctx.propertyId);
        await deps.unitOfWork.run(async (stores) => {
          await stores.billing.removeUnitFromPools(
            ctx.propertyId,
            input.id,
            changedOn,
          );
          await stores.unitRepository.delete(ctx.propertyId, input.id);
        });
        return { ok: true as const };
      }),
  });
}
