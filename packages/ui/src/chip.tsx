import type * as React from "react";

import { cn } from "@moonship/ui";

export function Chip({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="chip"
      className={cn(
        "border-line-2 text-fg-2 inline-flex h-[19px] items-center rounded-[5px] border px-1.5 font-mono text-[11px] font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}
