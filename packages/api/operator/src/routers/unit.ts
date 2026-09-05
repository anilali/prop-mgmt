import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type {
  PropertyRepository,
  UnitQueries,
  UnitRepository,
  UnitStatus,
  UtilityAssignment,
} from "@moonship/property";
import { Unit, validateUtilityAssignments } from "@moonship/property";
import type { LeaseQueries } from "@moonship/lease-mgmt";

import { operatorStaffProcedure, router } from "../trpc";

export interface UnitRouterDeps {
  unitRepository: UnitRepository;
  unitQueries: UnitQueries;
  propertyRepository: PropertyRepository;
  leaseQueries: LeaseQueries;
}

const unitStatusSchema = z.enum(["vacant", "occupied", "offline"]);
const utilityTypeSchema = z.enum([
  "electric",
  "gas",
  "water",
  "sewer",
  "trash",
]);
const utilityAssignmentSchema = z.discriminatedUnion("kind", [
  z.object({ type: utilityTypeSchema, kind: z.literal("individual") }),
  z.object({
    type: utilityTypeSchema,
    kind: z.literal("shares"),
    withUnitId: z.string().uuid(),
  }),
]);
const addressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

export function unitRouter(deps: UnitRouterDeps) {
  return router({
    list: operatorStaffProcedure.query(async () => {
      return deps.unitQueries.list();
    }),

    create: operatorStaffProcedure
      .input(
        z.object({
          label: z.string().min(1),
          sqft: z.number().int().positive(),
          bedrooms: z.number().int().min(0).optional(),
          bathrooms: z.number().min(0).optional(),
          addressOverride: addressSchema.nullable().optional(),
          utilities: z.array(utilityAssignmentSchema).optional(),
          status: unitStatusSchema.optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const property = await deps.propertyRepository.findSingleton();
        if (!property) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Property must be bootstrapped before creating units",
          });
        }

        const existing = await deps.unitQueries.list();
        const existingIds = new Set(existing.map((u) => u.id));
        const id = randomUUID();
        const utilities = (input.utilities ?? []) as UtilityAssignment[];
        try {
          validateUtilityAssignments(id, utilities, existingIds);
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Invalid utilities",
          });
        }

        const unit = Unit.create({
          id,
          propertyId: property.id,
          label: input.label,
          sqft: input.sqft,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          addressOverride: input.addressOverride ?? null,
          utilities,
          status: (input.status ?? "vacant") as UnitStatus,
        });
        await deps.unitRepository.save(unit);
        return deps.unitQueries.getById(unit.id);
      }),

    update: operatorStaffProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          label: z.string().min(1).optional(),
          sqft: z.number().int().positive().optional(),
          bedrooms: z.number().int().min(0).nullable().optional(),
          bathrooms: z.number().min(0).nullable().optional(),
          addressOverride: addressSchema.nullable().optional(),
          utilities: z.array(utilityAssignmentSchema).optional(),
          status: unitStatusSchema.optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const unit = await deps.unitRepository.findById(input.id);
        if (!unit) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (input.utilities !== undefined) {
          const existing = await deps.unitQueries.list();
          const existingIds = new Set(
            existing.map((u) => u.id).filter((id) => id !== input.id),
          );
          try {
            validateUtilityAssignments(
              input.id,
              input.utilities as UtilityAssignment[],
              existingIds,
            );
          } catch (e) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: e instanceof Error ? e.message : "Invalid utilities",
            });
          }
        }

        unit.updateDetails({
          label: input.label,
          sqft: input.sqft,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          addressOverride: input.addressOverride,
          utilities: input.utilities as UtilityAssignment[] | undefined,
        });

        if (input.status !== undefined) {
          unit.changeStatus(input.status);
        }

        await deps.unitRepository.save(unit);
        return deps.unitQueries.getById(unit.id);
      }),

    remove: operatorStaffProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const active = await deps.leaseQueries.listActiveByUnitId(input.id);
        if (active.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot remove a unit with an active lease",
          });
        }
        const unit = await deps.unitRepository.findById(input.id);
        if (!unit) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await deps.unitRepository.delete(input.id);
        return { ok: true as const };
      }),
  });
}
