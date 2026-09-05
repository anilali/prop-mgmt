import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type {
  StaffMemberQueries,
  StaffMemberRepository,
  StaffRole,
} from "@moonship/property";
import { StaffMember } from "@moonship/property";

import {
  operatorStaffProcedure,
  protectedProcedure,
  router,
} from "../trpc";

export interface StaffRouterDeps {
  staffMemberRepository: StaffMemberRepository;
  staffMemberQueries: StaffMemberQueries;
}

const staffRoleSchema = z.enum(["admin", "staff"]);

async function assertAdminOrFirstStaff(
  deps: StaffRouterDeps,
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

export function staffRouter(deps: StaffRouterDeps) {
  return router({
    list: operatorStaffProcedure.query(async () => {
      return deps.staffMemberQueries.list();
    }),

    provision: protectedProcedure
      .input(
        z.object({
          authUserId: z.string().min(1),
          role: staffRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertAdminOrFirstStaff(deps, ctx.session.staff);

        const existing = await deps.staffMemberQueries.getByAuthUserId(
          input.authUserId,
        );
        if (existing && existing.status !== "deactivated") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Staff member already provisioned for this user",
          });
        }

        const member = StaffMember.create({
          id: randomUUID(),
          authUserId: input.authUserId,
          role: input.role as StaffRole,
          status: "active",
        });
        await deps.staffMemberRepository.save(member);
        return deps.staffMemberQueries.getByAuthUserId(input.authUserId);
      }),

    changeRole: operatorStaffProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          role: staffRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.session.staff.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const member = await deps.staffMemberRepository.findById(input.id);
        if (!member) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        member.changeRole(input.role as StaffRole);
        await deps.staffMemberRepository.save(member);
      }),

    deactivate: operatorStaffProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.session.staff.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const member = await deps.staffMemberRepository.findById(input.id);
        if (!member) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        member.deactivate();
        await deps.staffMemberRepository.save(member);
      }),
  });
}
