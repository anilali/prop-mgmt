import type * as React from "react";

import { cn } from "@moonship/ui";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "border-line-2 bg-sunk text-fg-3 inline-grid h-[17px] min-w-[17px] place-items-center rounded-[4px] border px-1 font-mono text-[10.5px] leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}
