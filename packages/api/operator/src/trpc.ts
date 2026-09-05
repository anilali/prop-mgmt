import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface OperatorSession {
  user: SessionUser;
  staff?: {
    id: string;
    role: "admin" | "staff";
    status: string;
  } | null;
}

export interface TRPCContext {
  session: OperatorSession | null;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export const operatorStaffProcedure = protectedProcedure.use(({ ctx, next }) => {
  const staff = ctx.session.staff;
  if (!staff || staff.status === "deactivated") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({
    ctx: {
      ...ctx,
      session: {
        ...ctx.session,
        staff,
      },
    },
  });
});
