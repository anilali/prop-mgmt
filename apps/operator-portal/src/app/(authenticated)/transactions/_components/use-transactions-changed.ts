"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

export function useTransactionsChanged() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.transaction.pathFilter()),
      queryClient.invalidateQueries(trpc.bankImport.listBatches.queryFilter()),
      queryClient.invalidateQueries(trpc.rent.pathFilter()),
    ]);
}
