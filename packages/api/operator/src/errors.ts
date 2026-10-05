import { TRPCError } from "@trpc/server";

export function toBadRequest(error: unknown, fallback: string): TRPCError {
  if (error instanceof TRPCError) return error;
  return new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallback,
  });
}

export function conflict(message: string): TRPCError {
  return new TRPCError({ code: "CONFLICT", message });
}

export function badRequest(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}

export function notFound(message?: string): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message });
}
