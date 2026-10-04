import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import type { AccessState } from "@moonship/access";
import {
  canManageAccess,
  canOperate,
  canRegisterProperty,
  isPlatformAdmin,
} from "@moonship/access";

import type { Operator } from "./operator";
import type { RequestAccess } from "./operator-context";

export interface TRPCContext {
  access: RequestAccess | null;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.access) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      access: ctx.access,
      operator: ctx.access.operator,
      state: ctx.access.state,
    },
  });
});

export function requireCanOperate(
  operator: Operator,
  propertyId: string,
  state: AccessState,
): void {
  if (!canOperate(operator, propertyId, state)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export function requireCanManageAccess(
  operator: Operator,
  propertyId: string,
  state: AccessState,
): void {
  if (!canManageAccess(operator, propertyId, state)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export function requireCanRegisterProperty(
  operator: Operator,
  state: AccessState,
): void {
  if (!canRegisterProperty(operator, state)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const propertyProcedure = protectedProcedure.use(({ ctx, next }) => {
  const context = ctx.access.context;
  if (context.mode !== "property") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  requireCanOperate(ctx.operator, context.propertyId, ctx.state);
  return next({
    ctx: {
      ...ctx,
      propertyId: context.propertyId,
    },
  });
});

export const platformAdminProcedure = protectedProcedure.use(
  ({ ctx, next }) => {
    if (!isPlatformAdmin(ctx.operator, ctx.state)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  },
);
