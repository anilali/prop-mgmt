"use client";

import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { formatCents } from "@moonship/shared";
import { Button } from "@moonship/ui/button";

import type { LateFeeSuggestion } from "../_lib/rent";
import { useTRPC } from "~/trpc/react";
import { formatMonth } from "../_lib/rent";
import { formatDate } from "../../leases/_lib/format";

export function LateFeeSuggestionItem({
  suggestion,
  title,
}: {
  suggestion: LateFeeSuggestion;
  title?: ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.rent.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
    ]);
  const onError = (err: { message: string }) => toast.error(err.message);

  const approve = useMutation(
    trpc.rent.approveLateFee.mutationOptions({
      onSuccess: async ({ entry, movedFrom }) => {
        await refresh();
        if (movedFrom) {
          toast.success("Late fee approved", {
            description: `${formatDate(movedFrom)} is in a finalized year, so the fee is dated today, ${formatDate(entry.entryDate)}.`,
            duration: 10000,
          });
        } else {
          toast.success("Late fee approved", {
            description: `Added to the balance on ${formatDate(entry.entryDate)}.`,
          });
        }
      },
      onError,
    }),
  );

  const dismiss = useMutation(
    trpc.rent.dismissLateFee.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("Late fee dismissed");
      },
      onError,
    }),
  );

  const pending = approve.isPending || dismiss.isPending;
  const input = { accountId: suggestion.accountId, month: suggestion.month };

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {title ? <div className="font-medium">{title}</div> : null}
        <p>
          Late fee for {formatMonth(suggestion.month)}:{" "}
          <span className="font-medium tabular-nums">
            {formatCents(suggestion.amountCents)}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          Not paid in full by the fee date, {formatDate(suggestion.feeDate)}.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => approve.mutate(input)}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => dismiss.mutate(input)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
