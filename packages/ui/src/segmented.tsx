"use client";

import type { ReactNode } from "react";

import { cn } from "@moonship/ui";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  className?: string;
  "aria-label"?: string;
}

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="segmented"
      className={cn(
        "border-line bg-sunk inline-flex gap-0.5 rounded-[7px] border p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "focus-visible:ring-accent-soft inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-[5px] px-[9px] text-[12px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--line-2)]"
                : "text-fg-2 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
