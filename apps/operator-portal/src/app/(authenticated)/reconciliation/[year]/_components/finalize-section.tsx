"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { blockerCount, plural, riseStyle } from "../../_lib/reconciliation";
import { formatDate } from "../../../_lib/format";

function missingForFinalize(workspace: Workspace): string[] {
  const { year, gates, letterDate } = workspace;
  const blockers = blockerCount(workspace);
  return [
    gates.draft ? null : `${year} is already finalized`,
    blockers > 0
      ? `${plural(blockers, "checklist item", "checklist items")} to fix`
      : null,
    letterDate === null
      ? "Set a letter date"
      : gates.letterDateAfterYearEnd
        ? null
        : `Set a letter date after ${formatDate(`${year}-12-31`)}`,
    gates.todayAfterYearEnd ? null : `Opens ${formatDate(`${year + 1}-01-01`)}`,
    gates.previousYearFinalized ? null : `Finalize ${year - 1} first`,
  ].filter((reason) => reason !== null);
}

export function FinalizeSection({ workspace }: { workspace: Workspace }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { year, letterDate, statements } = workspace;
  const january1 = formatDate(`${year + 1}-01-01`);
  const missing = missingForFinalize(workspace);
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
    <div className="animate-rise flex justify-end" style={riseStyle(2)}>
      <Button
        type="button"
        variant="primary"
        disabled={!workspace.canFinalize || finalize.isPending}
        title={missing.length > 0 ? missing.join(" · ") : undefined}
        onClick={() => {
          finalize.reset();
          setConfirming(true);
        }}
      >
        Finalize {year}
      </Button>
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
          <ul className="text-fg-2 list-disc space-y-1.5 pl-5 text-[12.5px]">
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
            <p className="text-red text-[12.5px]">{finalize.error.message}</p>
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
              variant="primary"
              disabled={finalize.isPending}
              onClick={() => finalize.mutate({ year })}
            >
              {finalize.isPending ? "Finalizing" : `Finalize ${year}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
