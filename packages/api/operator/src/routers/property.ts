import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { PropertyQueries, PropertyRepository } from "@moonship/property";
import { Property } from "@moonship/property";

import { platformAdminProcedure, propertyProcedure, router } from "../trpc";

export interface PropertyRouterDeps {
  propertyRepository: PropertyRepository;
  propertyQueries: PropertyQueries;
}

const addressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

export function propertyRouter(deps: PropertyRouterDeps) {
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

    get: propertyProcedure.query(async ({ ctx }) => {
      const property = await deps.propertyQueries.getById(ctx.propertyId);
      if (!property) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return property;
    }),

    register: platformAdminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          address: addressSchema,
        }),
      )
      .mutation(async ({ input }) => {
        const property = Property.create({
          id: randomUUID(),
          name: input.name,
          address: input.address,
        });
        await deps.propertyRepository.save(property);

        const created = await deps.propertyQueries.getById(property.id);
        if (!created) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return created;
      }),

    update: propertyProcedure
      .input(
        z.object({
          name: z.string().min(1).optional(),
          address: addressSchema.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const property = await deps.propertyRepository.findById(ctx.propertyId);
        if (!property) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        property.updateMetadata({
          name: input.name,
          address: input.address,
        });
        await deps.propertyRepository.save(property);
        return deps.propertyQueries.getById(property.id);
      }),
  });
}
