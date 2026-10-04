import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "./root";

export type { AppRouter } from "./root";
export type {
  ClaimAccessOnSignInDeps,
  ClaimAccessOnSignInResult,
} from "./access";
export { claimAccessOnSignIn } from "./access";
export type { Operator } from "./operator";
export { mapSessionToOperator } from "./operator";
export type { TRPCContext } from "./trpc";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
