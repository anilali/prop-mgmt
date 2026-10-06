"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { parseCents } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { formatMoney } from "@moonship/ui/money";
import { Segmented } from "@moonship/ui/segmented";

import type { EntryRow } from "../../../_lib/rent";
import { useTRPC } from "~/trpc/react";
import { FormField } from "../../_components/form-field";
import { centsToInput, formatDate } from "../../../_lib/format";
import { useLedgerChanged } from "../../../_lib/use-ledger-changed";

export type AdjustmentTarget =
  | { mode: "add" }
  | { mode: "edit"; row: EntryRow };

type Direction = "charge" | "credit";

function parseAmount(text: string): number | null {
  try {
    return parseCents(text);
  } catch {
    return null;
  }
}

export function AdjustmentDialog({
  accountId,
  accountName,
  today,
  trackingStart,
  target,
  onClose,
}: {
  accountId: string;
  accountName: string;
  today: string;
  trackingStart: string | null;
  target: AdjustmentTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target?.mode === "edit" ? "Edit adjustment" : "Add adjustment"}
          </DialogTitle>
          <DialogDescription>
            A charge or credit on {accountName}, for anything the lease rules
            don&apos;t cover.
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <AdjustmentForm
            accountId={accountId}
            today={today}
            trackingStart={trackingStart}
            row={target.mode === "edit" ? target.row : null}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AdjustmentForm({
  accountId,
  today,
  trackingStart,
  row,
  onDone,
}: {
  accountId: string;
  today: string;
  trackingStart: string | null;
  row: EntryRow | null;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const refresh = useLedgerChanged();
  const [date, setDate] = useState(row?.date ?? today);
  const [direction, setDirection] = useState<Direction>(
    row && row.amountCents < 0 ? "credit" : "charge",
  );
  const [amount, setAmount] = useState(
    row ? centsToInput(Math.abs(row.amountCents)) : "",
  );
  const [note, setNote] = useState(row?.note ?? "");

  const onError = (err: { message: string }) => toast.error(err.message);

  const add = useMutation(
    trpc.rent.addAdjustment.mutationOptions({
      onSuccess: async ({ entry, movedFrom }) => {
        await refresh();
        const label = `Recorded ${entry.amountCents < 0 ? "credit" : "charge"} of ${formatMoney(Math.abs(entry.amountCents))}`;
        if (movedFrom) {
          toast.success(label, {
            description: `${formatDate(movedFrom)} is in a finalized year, so the adjustment is dated ${formatDate(entry.entryDate)} instead.`,
            duration: 10000,
          });
        } else {
          toast.success(label);
        }
        onDone();
      },
      onError,
    }),
  );
  const update = useMutation(
    trpc.rent.updateAdjustment.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("Adjustment saved");
        onDone();
      },
      onError,
    }),
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseAmount(amount);
        if (cents === null || cents <= 0) {
          toast.error("Enter an amount above 0");
          return;
        }
        const input = {
          date,
          amountCents: direction === "credit" ? -cents : cents,
          note: note.trim(),
        };
        if (input.note === "") {
          toast.error("Enter a note");
          return;
        }
        if (row) {
          update.mutate({ id: row.entryId, ...input });
        } else {
          add.mutate({ accountId, ...input });
        }
      }}
    >
      <Segmented<Direction>
        aria-label="Charge or credit"
        value={direction}
        onValueChange={setDirection}
        options={[
          { value: "charge", label: "Charge" },
          { value: "credit", label: "Credit" },
        ]}
        className="self-start"
      />
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FormField label="Amount">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Date">
          <Input
            type="date"
            value={date}
            min={trackingStart ?? undefined}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </FormField>
      </div>
      <FormField label="Note" hint="Shows on the account's activity.">
        <Input
          value={note}
          maxLength={500}
          placeholder="Bounced check #2291"
          onChange={(e) => setNote(e.target.value)}
          required
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={add.isPending || update.isPending}
        >
          {row ? "Save" : "Add adjustment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
