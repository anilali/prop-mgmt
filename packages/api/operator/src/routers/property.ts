import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { BillingQueries } from "@moonship/billing";
import type { AccountQueries } from "@moonship/lease-mgmt";
import type { PropertyQueries, PropertyRepository } from "@moonship/property";
import { accountStart, seedPropertySetup } from "@moonship/billing";
import { Property } from "@moonship/property";

import type { UnitOfWork } from "../unit-of-work";
import { toAccountTerms } from "../accounts";
import { conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { addressSchema, isoDate } from "../schemas";
import { platformAdminProcedure, propertyProcedure, router } from "../trpc";

export interface PropertyRouterDeps {
  propertyRepository: PropertyRepository;
  propertyQueries: PropertyQueries;
  accountQueries: AccountQueries;
  billingQueries: BillingQueries;
  unitOfWork: UnitOfWork;
}

const letterTextSchema = z.string().max(255).nullable().optional();

export function propertyRouter(deps: PropertyRouterDeps) {
  async function getWithToday(propertyId: string) {
    const { property, today } = await loadProperty(
      deps.propertyQueries,
      propertyId,
    );
    return { ...property, today };
  }

  return router({
    list: platformAdminProcedure.query(async () => {
      const properties = await deps.propertyQueries.list();
      return [...properties].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    }),

    getForPlatform: platformAdminProcedure
      .input(z.object({ propertyId: z.string().uuid() }))
      .query(async ({ input }) => {
        const property = await deps.propertyQueries.getById(input.propertyId);
        if (!property) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return property;
      }),

    get: propertyProcedure.query(({ ctx }) => getWithToday(ctx.propertyId)),

    register: platformAdminProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          address: addressSchema,
        }),
      )
      .mutation(async ({ input }) => {
        let property: Property;
        try {
          property = Property.create({
            id: randomUUID(),
            name: input.name,
            address: input.address,
          });
        } catch (e) {
          throw toBadRequest(e, "Register failed");
        }
        const { pools, categories } = seedPropertySetup({
          propertyId: property.id,
          unitIds: [],
          newId: randomUUID,
        });
        await deps.unitOfWork.run(async (stores) => {
          await stores.propertyRepository.save(property);
          for (const pool of pools) {
            await stores.billing.savePool(pool);
          }
          for (const category of categories) {
            await stores.billing.saveCategory(category);
          }
        });

        const created = await deps.propertyQueries.getById(property.id);
        if (!created) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return created;
      }),

    update: propertyProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255).optional(),
          address: addressSchema.optional(),
          trackingStartDate: isoDate.nullable().optional(),
          timeZone: z.string().min(1).max(64).optional(),
          letter: z
            .object({
              ownerName: letterTextSchema,
              ownerTitle: letterTextSchema,
              companyName: letterTextSchema,
              ownerPhone: z.string().max(64).nullable().optional(),
              ownerEmail: z
                .union([z.string().email().max(255), z.literal("")])
                .nullable()
                .optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const property = await deps.propertyRepository.findById(ctx.propertyId);
        if (!property) throw notFound();

        const trackingStartDate = input.trackingStartDate;
        if (
          trackingStartDate !== undefined &&
          trackingStartDate !== property.trackingStartDate
        ) {
          if (
            await deps.billingQueries.hasTransactionsOrLedgerEntries(
              ctx.propertyId,
            )
          ) {
            throw conflict(
              "The tracking start date cannot change once transactions or balance entries exist",
            );
          }
          const accounts = await deps.accountQueries.list(ctx.propertyId);
          const blocked = accounts.some(
            (account) =>
              account.openingBalanceCents !== 0 &&
              (trackingStartDate === null ||
                accountStart(toAccountTerms(account)) > trackingStartDate),
          );
          if (blocked) {
            throw conflict(
              "An account with an opening balance would start after this tracking start date. Change its opening balance first.",
            );
          }
        }

        try {
          property.updateMetadata({
            name: input.name,
            address: input.address,
            timeZone: input.timeZone,
          });
          if (trackingStartDate !== undefined) {
            property.setTrackingStartDate(trackingStartDate);
          }
          if (input.letter) {
            property.updateLetterDetails(input.letter);
          }
        } catch (e) {
          throw toBadRequest(e, "Update failed");
        }
        await deps.propertyRepository.save(property);
        return getWithToday(ctx.propertyId);
      }),
  });
}
