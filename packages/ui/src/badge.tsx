import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@moonship/ui";

export const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1.5 rounded-[5px] border px-[7px] text-[11.5px] font-medium whitespace-nowrap transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent-soft text-primary border-transparent",
        secondary: "bg-hover text-fg-2 border-line",
        outline: "text-fg-2 border-line-2",
        destructive: "bg-red-soft text-red border-transparent",
        red: "bg-red-soft text-red border-transparent",
        amber: "bg-amber-soft text-amber border-transparent",
        green: "bg-green-soft text-green border-transparent",
        blue: "bg-blue-soft text-blue border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
