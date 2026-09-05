import { publicProcedure, router } from "../trpc";

export function healthRouter() {
  return router({
    ok: publicProcedure.query(() => ({ ok: true as const })),
  });
}
