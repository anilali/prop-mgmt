import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { AccessQueries, PropertyAccessRepository } from "@moonship/access";
import { OptimisticConcurrencyError, PropertyAccess } from "@moonship/access";

import { protectedProcedure, requireCanManageAccess, router } from "../trpc";

export interface AccessRouterDeps {
  propertyAccessRepository: PropertyAccessRepository;
  accessQueries: AccessQueries;
}

const propertyIdSchema = z.string().uuid();
const membershipRoleSchema = z.enum(["admin", "staff"]);

function toTRPCError(error: unknown): TRPCError {
  if (error instanceof OptimisticConcurrencyError) {
    return new TRPCError({
      code: "CONFLICT",
      message: "Access changed concurrently; refetch and retry",
    });
  }
  if (error instanceof TRPCError) return error;
  const message = error instanceof Error ? error.message : "Access failed";
  if (/not found/i.test(message)) {
    return new TRPCError({ code: "NOT_FOUND", message });
  }
  if (/last active admin/i.test(message)) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message });
  }
  if (/no active admin/i.test(message)) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message });
  }
  if (/reactivate it first/i.test(message)) {
    return new TRPCError({ code: "CONFLICT", message });
  }
  if (/already exists/i.test(message)) {
    return new TRPCError({ code: "CONFLICT", message });
  }
  return new TRPCError({ code: "BAD_REQUEST", message });
}

export function accessRouter(deps: AccessRouterDeps) {
  return router({
    list: protectedProcedure
      .input(z.object({ propertyId: propertyIdSchema }))
      .query(async ({ ctx, input }) => {
        requireCanManageAccess(ctx.operator, input.propertyId, ctx.state);
        return deps.accessQueries.getMemberships(input.propertyId);
      }),

    grant: protectedProcedure
      .input(
        z.object({
          propertyId: propertyIdSchema,
          email: z.string().email(),
          role: membershipRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireCanManageAccess(ctx.operator, input.propertyId, ctx.state);
        try {
          const access =
            (await deps.propertyAccessRepository.findByPropertyId(
              input.propertyId,
            )) ?? PropertyAccess.create({ propertyId: input.propertyId });
          const expectedVersion = access.version;
          const existing = access.findByEmail(input.email);
          if (existing?.status === "active") {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Membership already exists for ${existing.email} on property ${input.propertyId}`,
            });
          }
          if (existing) {
            access.reactivateMembership(
              existing.id,
              input.role,
              ctx.operator.authUserId,
            );
          } else {
            access.grantMembership({
              membershipId: randomUUID(),
              email: input.email,
              role: input.role,
              actedByAuthUserId: ctx.operator.authUserId,
            });
          }
          await deps.propertyAccessRepository.save(access, expectedVersion);
          const granted = access.findByEmail(input.email);
          if (!granted) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Membership for ${input.email} was not created on property ${input.propertyId}`,
            });
          }
          return granted;
        } catch (error) {
          throw toTRPCError(error);
        }
      }),

    changeRole: protectedProcedure
      .input(
        z.object({
          propertyId: propertyIdSchema,
          membershipId: z.string().uuid(),
          role: membershipRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireCanManageAccess(ctx.operator, input.propertyId, ctx.state);
        try {
          const access = await deps.propertyAccessRepository.findByPropertyId(
            input.propertyId,
          );
          if (!access) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          const expectedVersion = access.version;
          access.changeMembershipRole(
            input.membershipId,
            input.role,
            ctx.operator.authUserId,
          );
          await deps.propertyAccessRepository.save(access, expectedVersion);
        } catch (error) {
          throw toTRPCError(error);
        }
      }),

    revoke: protectedProcedure
      .input(
        z.object({
          propertyId: propertyIdSchema,
          membershipId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireCanManageAccess(ctx.operator, input.propertyId, ctx.state);
        try {
          const access = await deps.propertyAccessRepository.findByPropertyId(
            input.propertyId,
          );
          if (!access) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          const expectedVersion = access.version;
          access.revokeMembership(input.membershipId, ctx.operator.authUserId);
          await deps.propertyAccessRepository.save(access, expectedVersion);
        } catch (error) {
          throw toTRPCError(error);
        }
      }),
  });
}
