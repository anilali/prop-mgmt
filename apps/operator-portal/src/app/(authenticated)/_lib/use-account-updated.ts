"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";

import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "./use-ledger-changed";

type AccountDetail = RouterOutputs["account"]["get"];

export function useAccountUpdated(accountId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  return async (detail: AccountDetail) => {
    queryClient.setQueryData(
      trpc.account.get.queryKey({ id: accountId }),
      detail,
    );
    await Promise.all([
      queryClient.invalidateQueries(trpc.account.list.queryFilter()),
      ledgerChanged(),
    ]);
  };
}

export function useAccountUpdateFailed(accountId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async (err: { message: string; data?: { code?: string } | null }) => {
    toast.error(err.message);
    if (err.data?.code !== "CONFLICT") return;
    await Promise.all([
      queryClient.invalidateQueries(
        trpc.account.get.queryFilter({ id: accountId }),
      ),
      queryClient.invalidateQueries(trpc.home.comingUp.queryFilter()),
    ]);
  };
}
