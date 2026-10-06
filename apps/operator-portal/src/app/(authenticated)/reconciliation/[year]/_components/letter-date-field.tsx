"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import { useTRPC } from "~/trpc/react";
import { riseStyle } from "../../_lib/reconciliation";

export function LetterDateField(props: {
  year: number;
  letterDate: string | null;
}) {
  return <LetterDateForm key={props.letterDate ?? ""} {...props} />;
}

function LetterDateForm({
  year,
  letterDate,
}: {
  year: number;
  letterDate: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const nextYear = year + 1;
  const january1 = `${nextYear}-01-01`;
  const [value, setValue] = useState(letterDate ?? "");

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
    <section
      className="border-line animate-rise max-w-[520px] rounded-lg border"
      style={riseStyle(0)}
    >
      <div className="border-line border-b px-3.5 py-[11px]">
        <h3 className="text-[13px] font-semibold">Letter date</h3>
      </div>
      <form
        className="flex flex-wrap items-end gap-2.5 p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) save.mutate({ year, letterDate: value });
        }}
      >
        <div className="grid w-[200px] gap-1.5">
          <Label htmlFor="letter-date">Date printed on every letter</Label>
          <Input
            id="letter-date"
            type="date"
            className="font-mono"
            value={value}
            min={january1}
            max={`${nextYear}-12-31`}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </div>
        {changed ? (
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Save
          </Button>
        ) : null}
        {letterDate === january1 ? null : (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => save.mutate({ year, letterDate: january1 })}
          >
            Use Jan 1, {nextYear}
          </Button>
        )}
      </form>
    </section>
  );
}
