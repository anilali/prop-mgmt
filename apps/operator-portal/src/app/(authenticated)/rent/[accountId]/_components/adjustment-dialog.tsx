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
import { Label } from "@moonship/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";
import { Textarea } from "@moonship/ui/textarea";

import type { EntryRow } from "../../_lib/rent";
import { useTRPC } from "~/trpc/react";
import { useLedgerChanged } from "../../../_lib/use-ledger-changed";
import { centsToInput, formatDate } from "../../../leases/_lib/format";

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
  today,
  trackingStart,
  target,
  onClose,
}: {
  accountId: string;
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
            A charge adds to what the tenant owes. A credit takes away from it.
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
        if (movedFrom) {
          toast.success("Adjustment added", {
            description: `${formatDate(movedFrom)} is in a finalized year, so the adjustment is dated ${formatDate(entry.entryDate)} instead.`,
            duration: 10000,
          });
        } else {
          toast.success("Adjustment added");
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
      className="space-y-4"
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
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="adjustment-date">Date</Label>
          <Input
            id="adjustment-date"
            type="date"
            value={date}
            min={trackingStart ?? undefined}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adjustment-direction">Type</Label>
          <Select
            value={direction}
            onValueChange={(value) =>
              setDirection(value === "credit" ? "credit" : "charge")
            }
          >
            <SelectTrigger id="adjustment-direction" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="charge">Charge</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="adjustment-amount">Amount</Label>
          <Input
            id="adjustment-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="adjustment-note">Note</Label>
        <Textarea
          id="adjustment-note"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={add.isPending || update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
