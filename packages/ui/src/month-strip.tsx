import type * as React from "react";

import { cn } from "@moonship/ui";

export const MONTH_CELL_STATES = [
  "paid",
  "short",
  "unpaid",
  "open",
  "pending",
  "nodata",
  "future",
  "off",
] as const;

export type MonthCellState = (typeof MONTH_CELL_STATES)[number];

export const MONTH_CELL_TEXT: Record<MonthCellState, string> = {
  paid: "Paid in full",
  short: "Paid short",
  unpaid: "Not paid",
  open: "Not paid yet, not late",
  pending: "A deposit waiting to be sorted may cover this",
  nodata: "No bank data for this month yet",
  future: "Later this year",
  off: "Not active",
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface MonthCell {
  state: MonthCellState;
  label?: string;
  title?: string;
  current?: boolean;
}

const compactCell: Record<MonthCellState, string> = {
  paid: "bg-green border-transparent opacity-85",
  short:
    "border-amber bg-[linear-gradient(to_top,var(--amber)_50%,transparent_50%)]",
  unpaid: "border-red bg-red-soft",
  open: "border-amber",
  pending: "border-primary border-dashed",
  nodata:
    "border-line-2 bg-[repeating-linear-gradient(135deg,var(--line-3)_0_1px,transparent_1px_3px)]",
  future: "border-line opacity-60",
  off: "border-transparent bg-transparent",
};

const barCell: Record<MonthCellState, string> = {
  paid: "bg-green-soft border-green/45 shadow-[inset_0_-3px_0_var(--green)]",
  short:
    "border-amber bg-[linear-gradient(to_top,var(--amber-soft)_60%,transparent_60%)]",
  unpaid: "bg-red-soft border-red/50",
  open: "border-amber border-dashed",
  pending: "border-primary bg-accent-soft border-dashed",
  nodata:
    "bg-[repeating-linear-gradient(135deg,var(--line-2)_0_1px,transparent_1px_5px)]",
  future: "border-dotted opacity-45",
  off: "border-transparent",
};

export interface MonthStripProps
  extends Omit<React.ComponentProps<"div">, "children"> {
  cells: readonly MonthCell[];
  size?: "compact" | "bar";
}

function cellLabel(cell: MonthCell, index: number) {
  return cell.label ?? MONTH_LABELS[index % 12] ?? "";
}

function cellTitle(cell: MonthCell, index: number) {
  return (
    cell.title ?? `${cellLabel(cell, index)}: ${MONTH_CELL_TEXT[cell.state]}`
  );
}

export function MonthStrip({
  cells,
  size = "compact",
  className,
  style,
  ...props
}: MonthStripProps) {
  const columns = {
    gridTemplateColumns: `repeat(${cells.length}, ${size === "compact" ? "8px" : "minmax(0, 1fr)"})`,
  };

  if (size === "compact") {
    return (
      <div
        data-slot="month-strip"
        role="list"
        className={cn("inline-grid items-center gap-[3px]", className)}
        style={{ ...columns, ...style }}
        {...props}
      >
        {cells.map((cell, index) => (
          <span
            key={index}
            role="listitem"
            title={cellTitle(cell, index)}
            aria-label={cellTitle(cell, index)}
            data-state={cell.state}
            className={cn(
              "border-line-2 block h-[15px] w-2 rounded-[2px] border",
              compactCell[cell.state],
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      data-slot="month-strip"
      role="list"
      className={cn("grid gap-1 max-sm:gap-0.5", className)}
      style={{ ...columns, ...style }}
      {...props}
    >
      {cells.map((cell, index) => (
        <div
          key={index}
          role="listitem"
          title={cellTitle(cell, index)}
          aria-label={cellTitle(cell, index)}
          data-state={cell.state}
          className="flex min-w-0 flex-col gap-[5px]"
        >
          <span
            className={cn(
              "border-line-2 block h-7 rounded-[4px] border",
              barCell[cell.state],
            )}
          />
          <span
            className={cn(
              "text-center font-mono text-[10.5px] max-sm:text-[9px]",
              cell.current ? "text-foreground font-medium" : "text-fg-3",
            )}
          >
            {cellLabel(cell, index)}
          </span>
        </div>
      ))}
    </div>
  );
}
