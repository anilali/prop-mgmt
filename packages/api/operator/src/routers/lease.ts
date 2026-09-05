import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { BlobStorage } from "@moonship/blob-storage";
import type {
  LeaseQueries,
  LeaseRepository,
  LeaseStatus,
} from "@moonship/lease-mgmt";
import { Lease } from "@moonship/lease-mgmt";
import type { UnitQueries } from "@moonship/property";
import type { TenantQueries } from "@moonship/tenant-mgmt";

import { operatorStaffProcedure, router } from "../trpc";

export interface LeaseRouterDeps {
  leaseRepository: LeaseRepository;
  leaseQueries: LeaseQueries;
  unitQueries: UnitQueries;
  tenantQueries: TenantQueries;
  blobStorage: BlobStorage;
}

const leaseStatusSchema = z.enum(["draft", "active", "ended"]);

export function leaseRouter(deps: LeaseRouterDeps) {
  return router({
    list: operatorStaffProcedure
      .input(
        z
          .object({
            unitId: z.string().uuid().optional(),
            status: leaseStatusSchema.optional(),
          })
          .optional(),
      )
      .query(async ({ input }) => deps.leaseQueries.list(input)),

    get: operatorStaffProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const lease = await deps.leaseQueries.getById(input.id);
        if (!lease) throw new TRPCError({ code: "NOT_FOUND" });
        return lease;
      }),

    create: operatorStaffProcedure
      .input(
        z.object({
          unitId: z.string().uuid(),
          tenantId: z.string().uuid(),
          startDate: z.coerce.date(),
          endDate: z.coerce.date(),
          rentCents: z.number().int().min(0),
          depositCents: z.number().int().min(0).optional(),
          status: z.enum(["draft", "active"]).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const unit = await deps.unitQueries.getById(input.unitId);
        if (!unit) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unit not found" });
        }
        const tenant = await deps.tenantQueries.getById(input.tenantId);
        if (!tenant || tenant.status !== "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Active tenant required",
          });
        }
        const status = (input.status ?? "draft") as LeaseStatus;
        if (status === "active") {
          const existing = await deps.leaseQueries.listActiveByUnitId(
            input.unitId,
          );
          if (existing.length > 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Unit already has an active lease",
            });
          }
        }

        try {
          const lease = Lease.create({
            id: randomUUID(),
            unitId: input.unitId,
            tenantId: input.tenantId,
            startDate: input.startDate,
            endDate: input.endDate,
            rentCents: input.rentCents,
            depositCents: input.depositCents,
            status,
          });
          await deps.leaseRepository.save(lease);
          return deps.leaseQueries.getById(lease.id);
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Create failed",
          });
        }
      }),

    update: operatorStaffProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional(),
          rentCents: z.number().int().min(0).optional(),
          depositCents: z.number().int().min(0).nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const lease = await deps.leaseRepository.findById(input.id);
        if (!lease) throw new TRPCError({ code: "NOT_FOUND" });
        try {
          lease.updateMetadata({
            startDate: input.startDate,
            endDate: input.endDate,
            rentCents: input.rentCents,
            depositCents: input.depositCents,
          });
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Update failed",
          });
        }
        await deps.leaseRepository.save(lease);
        return deps.leaseQueries.getById(lease.id);
      }),

    activate: operatorStaffProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const lease = await deps.leaseRepository.findById(input.id);
        if (!lease) throw new TRPCError({ code: "NOT_FOUND" });
        const existing = await deps.leaseQueries.listActiveByUnitId(
          lease.unitId,
        );
        if (existing.some((l) => l.id !== lease.id)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Unit already has an active lease",
          });
        }
        try {
          lease.activate();
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Activate failed",
          });
        }
        await deps.leaseRepository.save(lease);
        return deps.leaseQueries.getById(lease.id);
      }),

    end: operatorStaffProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const lease = await deps.leaseRepository.findById(input.id);
        if (!lease) throw new TRPCError({ code: "NOT_FOUND" });
        lease.end();
        await deps.leaseRepository.save(lease);
        return deps.leaseQueries.getById(lease.id);
      }),

    attachDocument: operatorStaffProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          fileName: z.string().min(1),
          contentType: z.literal("application/pdf"),
          /** base64-encoded PDF body */
          contentBase64: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const lease = await deps.leaseRepository.findById(input.id);
        if (!lease) throw new TRPCError({ code: "NOT_FOUND" });

        const previousKey = lease.document?.storageKey;
        const storageKey = `leases/${lease.id}/${Date.now()}-${input.fileName}`;
        const body = Buffer.from(input.contentBase64, "base64");

        await deps.blobStorage.putObject({
          key: storageKey,
          body,
          contentType: input.contentType,
        });

        lease.attachDocument({
          storageKey,
          fileName: input.fileName,
          contentType: input.contentType,
          uploadedAt: new Date(),
        });
        await deps.leaseRepository.save(lease);

        if (previousKey && previousKey !== storageKey) {
          try {
            await deps.blobStorage.deleteObject(previousKey);
          } catch {
            // best-effort cleanup
          }
        }

        return deps.leaseQueries.getById(lease.id);
      }),

    documentDownloadUrl: operatorStaffProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const lease = await deps.leaseQueries.getById(input.id);
        if (!lease?.document) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const url = await deps.blobStorage.getSignedDownloadUrl(
          lease.document.storageKey,
        );
        return { url, fileName: lease.document.fileName };
      }),
  });
}
