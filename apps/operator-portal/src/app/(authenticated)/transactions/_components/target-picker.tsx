"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

import type { TargetOption } from "../_lib/transactions";

export function TargetPicker({
  value,
  options,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  options: readonly TargetOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder="Pick an account or category" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
            <span className="text-muted-foreground ml-2 text-xs">
              {option.kind}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
