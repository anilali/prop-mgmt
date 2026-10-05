"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

export function useLedgerChanged() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.rent.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
      queryClient.invalidateQueries(trpc.reconciliation.pathFilter()),
    ]);
}
