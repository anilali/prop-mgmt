import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { TenantQueries, TenantRepository } from "@moonship/tenant-mgmt";
import { Tenant } from "@moonship/tenant-mgmt";

import { toBadRequest } from "../errors";
import { addressSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface TenantRouterDeps {
  tenantRepository: TenantRepository;
  tenantQueries: TenantQueries;
}

export function tenantRouter(deps: TenantRouterDeps) {
  return router({
    list: propertyProcedure.query(async ({ ctx }) => {
      return deps.tenantQueries.list(ctx.propertyId);
    }),

    get: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const tenant = await deps.tenantQueries.getById(
          ctx.propertyId,
          input.id,
        );
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });
        return tenant;
      }),

    create: propertyProcedure
      .input(
        z.object({
          businessName: z.string().min(1).max(255),
          contactName: z.string().max(255).optional(),
          mailingAddress: addressSchema.optional(),
          email: z.string().email().max(255).optional(),
          phone: z.string().max(64).optional(),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        let tenant: Tenant;
        try {
          tenant = Tenant.create({
            id: randomUUID(),
            propertyId: ctx.propertyId,
            businessName: input.businessName,
            contactName: input.contactName,
            mailingAddress: input.mailingAddress,
            email: input.email,
            phone: input.phone,
            notes: input.notes,
          });
        } catch (e) {
          throw toBadRequest(e, "Create failed");
        }
        await deps.tenantRepository.save(tenant);
        return deps.tenantQueries.getById(ctx.propertyId, tenant.id);
      }),

    update: propertyProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          businessName: z.string().min(1).max(255).optional(),
          contactName: z.string().max(255).nullable().optional(),
          mailingAddress: addressSchema.nullable().optional(),
          email: z.string().email().max(255).nullable().optional(),
          phone: z.string().max(64).nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const tenant = await deps.tenantRepository.findById(
          ctx.propertyId,
          input.id,
        );
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });
        try {
          tenant.update({
            businessName: input.businessName,
            contactName: input.contactName,
            mailingAddress: input.mailingAddress,
            email: input.email,
            phone: input.phone,
            notes: input.notes,
          });
        } catch (e) {
          throw toBadRequest(e, "Update failed");
        }
        await deps.tenantRepository.save(tenant);
        return deps.tenantQueries.getById(ctx.propertyId, tenant.id);
      }),

    archive: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const tenant = await deps.tenantRepository.findById(
          ctx.propertyId,
          input.id,
        );
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });
        tenant.archive();
        await deps.tenantRepository.save(tenant);
        return deps.tenantQueries.getById(ctx.propertyId, tenant.id);
      }),
  });
}
