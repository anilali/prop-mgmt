// =============================================================================
// Composition Root: Tenant API
// =============================================================================

import { createTRPCRouter } from "./root";

export interface TenantAPIConfig {
  databaseUrl: string;
}

export function createTenantAPI(_config: TenantAPIConfig) {
  const { appRouter, createTRPCContext, createCallerFactory } =
    createTRPCRouter();

  return {
    appRouter,
    createTRPCContext,
    createCallerFactory,
  };
}
