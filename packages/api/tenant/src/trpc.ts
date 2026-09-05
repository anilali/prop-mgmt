import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type TenantSession = {
  user: SessionUser;
};

export type TRPCContext = {
  session: TenantSession | null;
};

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
