"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";

import type { Workspace } from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../../leases/_lib/format";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function Gate({ passed, label }: { passed: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {passed ? (
        <CircleCheck className="size-4 shrink-0 text-emerald-600" />
      ) : (
        <CircleX className="text-destructive size-4 shrink-0" />
      )}
      <span className={passed ? "text-muted-foreground" : undefined}>
        {label}
      </span>
    </li>
  );
}

export function FinalizeSection({ workspace }: { workspace: Workspace }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { year, gates, letterDate, statements } = workspace;
  const yearEnd = formatDate(`${year}-12-31`);
  const january1 = formatDate(`${year + 1}-01-01`);
  const blockerCount = workspace.checklist.filter(
    (item) => item.severity === "blocker",
  ).length;
  const trueUpCount = statements.filter(
    (s) => s.trueUpCents !== null && s.trueUpCents !== 0,
  ).length;
  const continuingCount = statements.filter(
    (s) => s.continuing !== null,
  ).length;

  const finalize = useMutation(
    trpc.reconciliation.finalize.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries();
        setConfirming(false);
        toast.success(`${result.year} finalized`, {
          description: `${plural(result.statements.length, "statement", "statements")} saved.`,
        });
      },
      onError: async (err) => {
        await queryClient.invalidateQueries(trpc.reconciliation.pathFilter());
        toast.error(err.message);
      },
    }),
  );

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Finalize {year}</h2>
          <p className="text-muted-foreground text-sm">
            Finalize runs once. It saves the PDFs, posts the true-ups, and sets
            the new estimates.
          </p>
        </div>
        <Button
          type="button"
          disabled={!workspace.canFinalize || finalize.isPending}
          onClick={() => {
            finalize.reset();
            setConfirming(true);
          }}
        >
          Finalize {year}
        </Button>
      </div>
      <ul className="space-y-1.5 text-sm">
        <Gate passed={gates.draft} label={`${year} is still a draft`} />
        <Gate
          passed={gates.letterDateAfterYearEnd}
          label={
            letterDate === null
              ? `Save a letter date after ${yearEnd}`
              : `The letter date (${formatDate(letterDate)}) is after ${yearEnd}`
          }
        />
        <Gate
          passed={gates.todayAfterYearEnd}
          label={
            gates.todayAfterYearEnd
              ? `${year} is over`
              : `Finalize opens on ${january1}`
          }
        />
        <Gate
          passed={blockerCount === 0}
          label={
            blockerCount === 0
              ? "Nothing in the checklist blocks finalize"
              : `${plural(blockerCount, "checklist item blocks", "checklist items block")} finalize`
          }
        />
      </ul>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!finalize.isPending) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize {year}?</DialogTitle>
            <DialogDescription>
              This runs once and cannot be undone. A later mistake is fixed with
              an adjustment on the account.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>
              {plural(statements.length, "PDF", "PDFs")} saved for download,
              with a copy of each statement&apos;s numbers.
            </li>
            <li>
              {trueUpCount === 0
                ? "No true-ups to post."
                : `${plural(trueUpCount, "true-up", "true-ups")} added to account balances, dated ${formatDate(letterDate)}.`}
            </li>
            <li>
              {continuingCount === 0
                ? "No account continues into the next year, so no new estimates are set."
                : `New estimates from ${january1} on ${plural(continuingCount, "account", "accounts")}.`}
            </li>
          </ul>
          {finalize.error ? (
            <p className="text-destructive text-sm">{finalize.error.message}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={finalize.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={finalize.isPending}
              onClick={() => finalize.mutate({ year })}
            >
              {finalize.isPending ? "Finalizing" : `Finalize ${year}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
