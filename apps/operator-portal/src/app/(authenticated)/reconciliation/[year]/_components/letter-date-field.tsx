"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../../leases/_lib/format";

export function LetterDateField(props: {
  year: number;
  letterDate: string | null;
  previewLetterDate: string;
}) {
  return <LetterDateForm key={props.letterDate ?? ""} {...props} />;
}

function LetterDateForm({
  year,
  letterDate,
  previewLetterDate,
}: {
  year: number;
  letterDate: string | null;
  previewLetterDate: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const nextYear = year + 1;
  const [value, setValue] = useState(letterDate ?? `${nextYear}-01-01`);

  const save = useMutation(
    trpc.reconciliation.setLetterDate.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.reconciliation.pathFilter());
        toast.success("Letter date saved");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const changed = value !== "" && value !== letterDate;

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) save.mutate({ year, letterDate: value });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="letter-date">Letter date</Label>
        <Input
          id="letter-date"
          type="date"
          className="w-44"
          value={value}
          min={`${nextYear}-01-01`}
          max={`${nextYear}-12-31`}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={!changed || save.isPending}>
        Save
      </Button>
      <p className="text-muted-foreground basis-full text-sm">
        {letterDate === null
          ? `Not saved yet. Previews use ${formatDate(previewLetterDate)}. Save a letter date before you finalize.`
          : `Letters and true-ups are dated ${formatDate(letterDate)}.`}{" "}
        The letter date must be in {nextYear}.
      </p>
    </form>
  );
}
