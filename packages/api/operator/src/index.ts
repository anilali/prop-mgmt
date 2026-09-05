import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "./root";

export type { AppRouter } from "./root";
export type {
  OperatorSession,
  SessionUser,
  TRPCContext,
} from "./trpc";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
