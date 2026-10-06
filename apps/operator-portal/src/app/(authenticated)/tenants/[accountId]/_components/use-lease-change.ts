"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import type {
  AccountDetail,
  LeaseFormState,
  PoolOption,
} from "../../_lib/lease-form";
import type { LeaseChange } from "../../_lib/lease-terms";
import { useTRPC } from "~/trpc/react";
import { toLeaseInput } from "../../_lib/lease-form";
import {
  useAccountUpdated,
  useAccountUpdateFailed,
} from "../../../_lib/use-account-updated";

function failure(err: unknown) {
  return {
    message: err instanceof Error ? err.message : "Could not save the lease",
    data:
      err instanceof TRPCClientError
        ? (err.data as { code?: string } | undefined)
        : null,
  };
}

export function useLeaseChange(
  accountId: string,
  version: number,
  pools: readonly PoolOption[],
) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(accountId);
  const accountUpdateFailed = useAccountUpdateFailed(accountId);
  const update = useMutation(trpc.lease.update.mutationOptions());
  const add = useMutation(trpc.lease.add.mutationOptions());

  const finish = async (
    detail: AccountDetail | null,
    error: unknown,
  ): Promise<boolean> => {
    if (detail) await accountUpdated(detail);
    if (error !== null) {
      await accountUpdateFailed(failure(error));
      return false;
    }
    return true;
  };

  const save = async (changes: readonly LeaseChange[]): Promise<boolean> => {
    let expectedVersion = version;
    let detail: AccountDetail | null = null;
    try {
      for (const change of changes) {
        detail = await update.mutateAsync({
          accountId,
          expectedVersion,
          leaseId: change.lease.id,
          lease: toLeaseInput(change.form, pools),
        });
        expectedVersion = detail.account.version;
      }
    } catch (err) {
      return finish(detail, err);
    }
    return finish(detail, null);
  };

  const addLease = async (form: LeaseFormState): Promise<boolean> => {
    try {
      const detail = await add.mutateAsync({
        accountId,
        expectedVersion: version,
        lease: toLeaseInput(form, pools),
      });
      return finish(detail, null);
    } catch (err) {
      return finish(null, err);
    }
  };

  return { save, addLease, pending: update.isPending || add.isPending };
}
