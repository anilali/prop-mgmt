"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";

export function useTransactionsChanged() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  return () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.transaction.pathFilter()),
      queryClient.invalidateQueries(trpc.bankImport.listBatches.queryFilter()),
      ledgerChanged(),
    ]);
}
