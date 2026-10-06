"use client";

import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import type { IsoDate, YearMonth } from "@moonship/shared";
import { Button } from "@moonship/ui/button";

import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../_lib/format";
import {
  useAccountUpdated,
  useAccountUpdateFailed,
} from "../../_lib/use-account-updated";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";

export type LateFeeOutcome =
  | { kind: "approved"; entryDate: IsoDate }
  | { kind: "dismissed" };

export function LateFeeActions({
  accountId,
  month,
  onDecided,
}: {
  accountId: string;
  month: YearMonth;
  onDecided: (outcome: LateFeeOutcome) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useLedgerChanged();
  const onError = async (err: {
    message: string;
    data?: { code?: string } | null;
  }) => {
    toast.error(err.message);
    if (err.data?.code === "CONFLICT") {
      await queryClient.invalidateQueries(trpc.home.comingUp.queryFilter());
    }
  };

  const approve = useMutation(
    trpc.rent.approveLateFee.mutationOptions({
      onSuccess: async ({ entry, movedFrom }) => {
        onDecided({ kind: "approved", entryDate: entry.entryDate });
        if (movedFrom) {
          toast.success("Late fee approved", {
            description: `${formatDate(movedFrom)} is in a finalized year, so the fee is dated today, ${formatDate(entry.entryDate)}.`,
            duration: 10000,
          });
        } else {
          toast.success("Late fee approved");
        }
        await refresh();
      },
      onError,
    }),
  );

  const dismiss = useMutation(
    trpc.rent.dismissLateFee.mutationOptions({
      onSuccess: async () => {
        onDecided({ kind: "dismissed" });
        toast.success("Late fee dismissed");
        await refresh();
      },
      onError,
    }),
  );

  const pending = approve.isPending || dismiss.isPending;
  const input = { accountId, month };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => dismiss.mutate(input)}
      >
        Dismiss
      </Button>
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() => approve.mutate(input)}
      >
        Approve fee
      </Button>
    </>
  );
}

export function NotifyAction({
  accountId,
  accountVersion,
  leaseId,
  stepId,
  notified,
  onChanged,
}: {
  accountId: string;
  accountVersion: number;
  leaseId: string;
  stepId: string;
  notified: boolean;
  onChanged: (notified: boolean) => void;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(accountId);
  const accountUpdateFailed = useAccountUpdateFailed(accountId);
  const setNotified = useMutation(
    trpc.lease.setRentStepNotified.mutationOptions({
      onSuccess: async (detail, variables) => {
        if (variables.notified) onChanged(true);
        await accountUpdated(detail);
        if (!variables.notified) onChanged(false);
      },
      onError: accountUpdateFailed,
    }),
  );
  const accountPending =
    useIsMutating({
      mutationKey: trpc.lease.setRentStepNotified.mutationKey(),
      predicate: (mutation) =>
        (mutation.state.variables as { accountId?: string } | undefined)
          ?.accountId === accountId,
    }) > 0;

  return (
    <Button
      type="button"
      size="sm"
      variant={notified ? "ghost" : "outline"}
      disabled={accountPending}
      onClick={() =>
        setNotified.mutate({
          accountId,
          expectedVersion: accountVersion,
          leaseId,
          stepId,
          notified: !notified,
        })
      }
    >
      {notified ? "Undo" : "Mark notified"}
    </Button>
  );
}
