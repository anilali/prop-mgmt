import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type {
  PropertyQueries,
  PropertyRepository,
  StaffMemberQueries,
  StaffMemberRepository,
} from "@moonship/property";
import { Property, StaffMember } from "@moonship/property";

import {
  operatorStaffProcedure,
  protectedProcedure,
  router,
} from "../trpc";

export interface PropertyRouterDeps {
  propertyRepository: PropertyRepository;
  propertyQueries: PropertyQueries;
  staffMemberQueries: StaffMemberQueries;
  staffMemberRepository: StaffMemberRepository;
}

const addressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

async function assertAdminOrFirstStaff(
  deps: PropertyRouterDeps,
  sessionStaff: { role: "admin" | "staff"; status: string } | null | undefined,
) {
  const staff = await deps.staffMemberQueries.list();
  const activeStaff = staff.filter((s) => s.status !== "deactivated");
  if (activeStaff.length === 0) return;
  if (sessionStaff?.role === "admin" && sessionStaff.status !== "deactivated") {
    return;
  }
  throw new TRPCError({ code: "FORBIDDEN" });
}

export function propertyRouter(deps: PropertyRouterDeps) {
  return router({
    get: protectedProcedure.query(async () => {
      return deps.propertyQueries.get();
    }),

    bootstrap: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          address: addressSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertAdminOrFirstStaff(deps, ctx.session.staff);

        const existing = await deps.propertyRepository.findSingleton();
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Property already exists",
          });
        }

        const property = Property.create({
          id: randomUUID(),
          name: input.name,
          address: input.address,
        });
        await deps.propertyRepository.save(property);

        const existingStaff = await deps.staffMemberQueries.getByAuthUserId(
          ctx.session.user.id,
        );
        if (!existingStaff) {
          const member = StaffMember.create({
            id: randomUUID(),
            authUserId: ctx.session.user.id,
            role: "admin",
            status: "active",
          });
          await deps.staffMemberRepository.save(member);
        }

        return deps.propertyQueries.get();
      }),

    claimAdmin: protectedProcedure.mutation(async ({ ctx }) => {
      const property = await deps.propertyRepository.findSingleton();
      if (!property) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Property is not configured",
        });
      }

      const existingStaff = await deps.staffMemberQueries.getByAuthUserId(
        ctx.session.user.id,
      );
      if (existingStaff && existingStaff.status !== "deactivated") {
        return {
          id: existingStaff.id,
          role: existingStaff.role,
          status: existingStaff.status,
        };
      }

      const activeStaff = (await deps.staffMemberQueries.list()).filter(
        (member) => member.status !== "deactivated",
      );
      if (activeStaff.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Staff is already provisioned for this property",
        });
      }

      const member = StaffMember.create({
        id: randomUUID(),
        authUserId: ctx.session.user.id,
        role: "admin",
        status: "active",
      });
      await deps.staffMemberRepository.save(member);

      return {
        id: member.id,
        role: member.role,
        status: member.status,
      };
    }),

    update: operatorStaffProcedure
      .input(
        z.object({
          name: z.string().min(1).optional(),
          address: addressSchema.optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const property = await deps.propertyRepository.findSingleton();
        if (!property) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        property.updateMetadata({
          name: input.name,
          address: input.address,
        });
        await deps.propertyRepository.save(property);
        return deps.propertyQueries.get();
      }),
  });
}
