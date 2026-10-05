"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

export function useTransactionsChanged() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.transaction.listToSort.queryFilter()),
      queryClient.invalidateQueries(trpc.transaction.list.queryFilter()),
      queryClient.invalidateQueries(trpc.bankImport.listBatches.queryFilter()),
    ]);
}
