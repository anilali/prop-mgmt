"use client";

import { Plus, X } from "lucide-react";

import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { formatMoney } from "@moonship/ui/money";
import { NativeSelect } from "@moonship/ui/select";

import type { DraftLine } from "../_lib/draft";
import type { TargetGroup } from "../_lib/transactions";
import { leftToSort, newDraftLine } from "../_lib/draft";

export function TargetSelect({
  value,
  groups,
  onChange,
  ariaLabel,
  id,
  className,
}: {
  value: string;
  groups: readonly TargetGroup[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  id?: string;
  className?: string;
}) {
  return (
    <NativeSelect
      id={id}
      aria-label={ariaLabel}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose…</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}

export function SplitEditor({
  amountCents,
  lines,
  groups,
  onChange,
}: {
  amountCents: number;
  lines: readonly DraftLine[];
  groups: readonly TargetGroup[];
  onChange: (lines: DraftLine[]) => void;
}) {
  const left = leftToSort(amountCents, lines);
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  return (
    <div>
      <div className="label-caps mb-2">
        Split into parts that add up to {formatMoney(Math.abs(amountCents))}
      </div>
      <div className="flex flex-col gap-[7px]">
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="grid grid-cols-[minmax(0,1fr)_96px_28px] items-center gap-[7px] sm:grid-cols-[minmax(0,1fr)_120px_28px]"
          >
            <TargetSelect
              ariaLabel={`Part ${index + 1} target`}
              value={line.target}
              groups={groups}
              onChange={(target) => update(line.key, { target })}
            />
            <Input
              className="text-right font-mono"
              inputMode="decimal"
              aria-label={`Part ${index + 1} amount`}
              value={line.amount}
              onChange={(e) => update(line.key, { amount: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove part ${index + 1}`}
              disabled={lines.length === 1}
              onClick={() =>
                onChange(lines.filter((other) => other.key !== line.key))
              }
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-[9px] flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...lines, newDraftLine("", left > 0 ? left : null)])
          }
        >
          <Plus />
          Add part
        </Button>
        <span
          className={cn(
            "font-mono text-xs",
            left === 0 ? "text-fg-3" : "text-red",
          )}
        >
          Left to sort {formatMoney(left)}
        </span>
      </div>
    </div>
  );
}
