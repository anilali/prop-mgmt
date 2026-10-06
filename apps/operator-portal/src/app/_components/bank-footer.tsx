"use client";

import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { addDays } from "@moonship/shared";
import { cn } from "@moonship/ui";

import { formatDate, formatMonthDay } from "~/app/(authenticated)/_lib/format";
import { useTRPC } from "~/trpc/react";

const STALE_AFTER_DAYS = 2;

export function BankFooter() {
  return (
    <footer className="border-line text-fg-3 flex h-[30px] flex-none items-center gap-3 border-t px-4 pb-[env(safe-area-inset-bottom)] text-[11.5px]">
      <Suspense fallback={null}>
        <BankStatus />
      </Suspense>
    </footer>
  );
}

function BankStatus() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.rent.bankStatus.queryOptions());

  const stale =
    data.newestBankDate === null ||
    data.newestBankDate < addDays(data.today, -STALE_AFTER_DAYS);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          stale ? "bg-amber" : "bg-green",
        )}
      />
      {data.newestBankDate ? (
        <span>
          Bank data through{" "}
          <b className="text-fg-2 font-medium">
            {data.newestBankDate.slice(0, 4) === data.today.slice(0, 4)
              ? formatMonthDay(data.newestBankDate)
              : formatDate(data.newestBankDate)}
          </b>
        </span>
      ) : (
        <span>No bank data yet</span>
      )}
    </span>
  );
}
