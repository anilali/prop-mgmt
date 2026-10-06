import type * as React from "react";

import { cn } from "@moonship/ui";

export type MoneyTone =
  | "default"
  | "muted"
  | "faint"
  | "red"
  | "amber"
  | "green"
  | "blue"
  | "signed";

const toneClass: Record<Exclude<MoneyTone, "signed">, string> = {
  default: "",
  muted: "text-fg-2",
  faint: "text-fg-3",
  red: "text-red",
  amber: "text-amber",
  green: "text-green",
  blue: "text-blue",
};

function groupDigits(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMoney(
  cents: number,
  options: { sign?: boolean; cents?: boolean } = {},
): string {
  const abs = Math.abs(cents);
  const body =
    (options.cents ?? true)
      ? `$${groupDigits(Math.floor(abs / 100))}.${(abs % 100).toString().padStart(2, "0")}`
      : `$${groupDigits(Math.round(abs / 100))}`;
  if (cents < 0) return `\u2212${body}`;
  if (options.sign && cents > 0) return `+${body}`;
  return body;
}

export interface MoneyProps
  extends Omit<React.ComponentProps<"span">, "children"> {
  cents: number;
  sign?: boolean;
  tone?: MoneyTone;
  hideCents?: boolean;
}

export function Money({
  cents,
  sign = false,
  tone = "default",
  hideCents = false,
  className,
  ...props
}: MoneyProps) {
  const resolved =
    tone === "signed"
      ? cents > 0
        ? toneClass.green
        : cents < 0
          ? toneClass.red
          : ""
      : toneClass[tone];
  return (
    <span
      data-slot="money"
      className={cn(
        "font-mono tracking-[-0.015em] whitespace-nowrap tabular-nums",
        resolved,
        className,
      )}
      {...props}
    >
      {formatMoney(cents, { sign, cents: !hideCents })}
    </span>
  );
}
