"use client";

import type { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { formatMoney } from "@moonship/ui/money";

import type { LateFeeSuggestion } from "../../../_lib/rent";
import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../../_lib/format";
import { useLedgerChanged } from "../../../_lib/use-ledger-changed";

const monthName = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

export function Banner({
  tone,
  children,
  actions,
}: {
  tone: "red" | "amber";
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      className={cn(
        "animate-rise mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border px-3 py-2.5 text-[12.5px]",
        tone === "red"
          ? "border-red/40 bg-red-soft"
          : "border-amber/40 bg-amber-soft",
      )}
    >
      <span className="min-w-[200px] flex-1">{children}</span>
      <span className="flex gap-1.5">{actions}</span>
    </div>
  );
}

export function LateFeeBanner({
  suggestion,
}: {
  suggestion: LateFeeSuggestion;
}) {
  const trpc = useTRPC();
  const refresh = useLedgerChanged();
  const onError = (err: { message: string }) => toast.error(err.message);

  const approve = useMutation(
    trpc.rent.approveLateFee.mutationOptions({
      onSuccess: async ({ entry, movedFrom }) => {
        await refresh();
        toast.success("Late fee approved", {
          description: movedFrom
            ? `${formatDate(movedFrom)} is in a finalized year, so the fee is dated today, ${formatDate(entry.entryDate)}.`
            : `Added to the balance on ${formatDate(entry.entryDate)}.`,
          duration: movedFrom ? 10000 : undefined,
        });
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
  const month = monthName.format(new Date(`${suggestion.month}-01T00:00:00Z`));

  return (
    <Banner
      tone="red"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => dismiss.mutate(input)}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => approve.mutate(input)}
          >
            Approve fee
          </Button>
        </>
      }
    >
      <b className="font-semibold">Late fee suggested.</b> {month} rent
      wasn&apos;t paid in full by {formatDate(suggestion.feeDate)}. Approving
      adds {formatMoney(suggestion.amountCents)}.
    </Banner>
  );
}
