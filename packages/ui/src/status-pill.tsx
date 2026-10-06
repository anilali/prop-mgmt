import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@moonship/ui";

export const statusPillVariants = cva(
  "inline-flex h-5 items-center gap-1.5 rounded-[5px] border px-[7px] text-[11.5px] font-medium whitespace-nowrap before:size-1.5 before:shrink-0 before:rounded-full before:bg-current",
  {
    variants: {
      variant: {
        behind: "bg-red-soft text-red border-transparent",
        due: "bg-amber-soft text-amber border-transparent",
        waiting:
          "bg-hover text-fg-2 border-line before:bg-transparent before:bg-[repeating-linear-gradient(135deg,currentColor_0_1.5px,transparent_1.5px_3px)]",
        paid: "bg-green-soft text-green border-transparent",
        credit: "bg-blue-soft text-blue border-transparent",
        accent: "bg-accent-soft text-primary border-transparent",
        plain: "bg-hover text-fg-2 border-line before:hidden",
      },
    },
    defaultVariants: {
      variant: "plain",
    },
  },
);

export type StatusPillVariant = NonNullable<
  VariantProps<typeof statusPillVariants>["variant"]
>;

export function StatusPill({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusPillVariants>) {
  return (
    <span
      data-slot="status-pill"
      className={cn(statusPillVariants({ variant }), className)}
      {...props}
    />
  );
}
