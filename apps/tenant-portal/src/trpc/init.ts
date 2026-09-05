import { createTenantAPI } from "@moonship/api-tenant/server";

import { env } from "~/env";

export const { appRouter, createTRPCContext } = createTenantAPI({
  databaseUrl: env.POSTGRES_URL,
});
