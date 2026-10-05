"use client";

import { useQueryClient } from "@tanstack/react-query";

import type { AccountDetail } from "../../_lib/lease-form";
import { useTRPC } from "~/trpc/react";

export function useAccountUpdated(accountId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async (detail: AccountDetail) => {
    queryClient.setQueryData(
      trpc.account.get.queryKey({ id: accountId }),
      detail,
    );
    await queryClient.invalidateQueries(trpc.account.list.queryFilter());
  };
}
