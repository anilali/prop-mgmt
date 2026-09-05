import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { TenantQueries, TenantRepository } from "@moonship/tenant-mgmt";
import { Tenant } from "@moonship/tenant-mgmt";

import { operatorStaffProcedure, router } from "../trpc";

export interface TenantRouterDeps {
  tenantRepository: TenantRepository;
  tenantQueries: TenantQueries;
}

export function tenantRouter(deps: TenantRouterDeps) {
  return router({
    list: operatorStaffProcedure.query(async () => deps.tenantQueries.list()),

    create: operatorStaffProcedure
      .input(
        z.object({
          fullName: z.string().min(1),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const tenant = Tenant.create({
          id: randomUUID(),
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          notes: input.notes,
        });
        await deps.tenantRepository.save(tenant);
        return deps.tenantQueries.getById(tenant.id);
      }),

    update: operatorStaffProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          fullName: z.string().min(1).optional(),
          email: z.string().email().nullable().optional(),
          phone: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const tenant = await deps.tenantRepository.findById(input.id);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });
        try {
          tenant.update({
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            notes: input.notes,
          });
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Update failed",
          });
        }
        await deps.tenantRepository.save(tenant);
        return deps.tenantQueries.getById(tenant.id);
      }),

    archive: operatorStaffProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const tenant = await deps.tenantRepository.findById(input.id);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });
        tenant.archive();
        await deps.tenantRepository.save(tenant);
        return deps.tenantQueries.getById(tenant.id);
      }),
  });
}
