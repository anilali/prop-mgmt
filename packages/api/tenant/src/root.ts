import type { TenantSession } from "./trpc";
import { publicProcedure, router, createCallerFactory } from "./trpc";

export function createTRPCRouter() {
  const appRouter = router({
    auth: router({
      getSession: publicProcedure.query(({ ctx }) => ctx.session),
    }),
    health: router({
      ok: publicProcedure.query(() => ({ ok: true as const })),
    }),
  });

  const createTRPCContext = (opts: {
    headers: Headers;
    session: TenantSession | null;
  }) => {
    return {
      session: opts.session,
    };
  };

  return {
    appRouter,
    createTRPCContext,
    createCallerFactory,
  };
}

export type AppRouter = ReturnType<typeof createTRPCRouter>["appRouter"];
