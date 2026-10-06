import type * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";

import { cn } from "@moonship/ui";

export function List({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list"
      className={cn("border-line overflow-hidden rounded-lg border", className)}
      {...props}
    />
  );
}

export interface ListGridProps {
  columns?: string;
}

function gridStyle(columns: string | undefined, style?: React.CSSProperties) {
  return columns ? { gridTemplateColumns: columns, ...style } : style;
}

export function ListHeader({
  className,
  columns,
  style,
  ...props
}: React.ComponentProps<"div"> & ListGridProps) {
  return (
    <div
      data-slot="list-header"
      role="row"
      className={cn(
        "border-line text-fg-3 grid items-center gap-3.5 border-b px-3.5 py-2 text-[11.5px]",
        className,
      )}
      style={gridStyle(columns, style)}
      {...props}
    />
  );
}

export function ListGroupHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-group-header"
      className={cn(
        "bg-sunk border-line text-fg-2 flex items-center gap-2 px-3.5 py-[7px] text-[12px] font-semibold [&:not(:first-child)]:border-t",
        className,
      )}
      {...props}
    />
  );
}

export function ListRow({
  className,
  columns,
  style,
  interactive,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  ListGridProps & { interactive?: boolean; asChild?: boolean }) {
  const Comp = asChild ? SlotPrimitive.Slot : "div";
  const clickable = interactive ?? (asChild || props.onClick !== undefined);
  return (
    <Comp
      data-slot="list-row"
      data-interactive={clickable ? "" : undefined}
      className={cn(
        "border-line relative grid items-center gap-3.5 px-3.5 py-2.5 transition-colors duration-100",
        "[[data-slot=list-group-header]+&]:border-t-0 [[data-slot=list-row]+&]:border-t",
        clickable &&
          "hover:bg-hover before:bg-primary cursor-pointer before:absolute before:inset-y-0 before:left-0 before:hidden before:w-0.5 hover:before:block",
        className,
      )}
      style={gridStyle(columns, style)}
      {...props}
    />
  );
}

export function ListFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-footer"
      className={cn(
        "bg-sunk border-line-2 text-fg-3 border-t px-3.5 py-2 text-[11.5px]",
        className,
      )}
      {...props}
    />
  );
}
