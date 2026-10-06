"use client";

import type * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@moonship/ui";

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer border-line-2 bg-sunk data-[state=checked]:bg-primary focus-visible:ring-accent-soft focus-visible:border-accent-line inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border p-px transition-colors duration-150 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-transparent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-fg-3 data-[state=checked]:bg-primary-foreground pointer-events-none block size-2.5 translate-x-px rounded-full transition-[transform,background-color] duration-[180ms] ease-[cubic-bezier(0.3,0.7,0.2,1)] data-[state=checked]:translate-x-[13px]"
      />
    </SwitchPrimitive.Root>
  );
}
