import type * as React from "react";
import { cva  } from "class-variance-authority";
import type {VariantProps} from "class-variance-authority";

import { cn } from "@moonship/ui";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-transparent shadow-xs",
        secondary:
          "bg-secondary text-secondary-foreground border-transparent",
        outline: "text-foreground",
        destructive:
          "bg-destructive text-white border-transparent shadow-xs",
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
