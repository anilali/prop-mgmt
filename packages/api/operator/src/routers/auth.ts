import { publicProcedure, router } from "../trpc";

export function authRouter() {
  return router({
    getSession: publicProcedure.query(({ ctx }) => ctx.session),
  });
}
