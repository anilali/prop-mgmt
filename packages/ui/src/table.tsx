import type * as React from "react";

import { cn } from "@moonship/ui";

export function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "border-line relative w-full overflow-x-auto rounded-lg border",
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-sunk [&_tr]:border-line [&_tr]:border-b", className)}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableFooter({
  className,
  ...props
}: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-sunk border-line-2 border-t font-semibold [&>tr]:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({
  className,
  interactive,
  ...props
}: React.ComponentProps<"tr"> & { interactive?: boolean }) {
  const clickable = interactive ?? props.onClick !== undefined;
  return (
    <tr
      data-slot="table-row"
      data-interactive={clickable ? "" : undefined}
      className={cn(
        "border-line data-[state=selected]:bg-press border-b transition-colors duration-100",
        clickable && "hover:bg-hover cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-fg-3 h-8 px-3 text-left align-middle text-[11.5px] font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 py-[9px] align-middle whitespace-nowrap", className)}
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-fg-3 mt-3 text-[11.5px]", className)}
      {...props}
    />
  );
}
