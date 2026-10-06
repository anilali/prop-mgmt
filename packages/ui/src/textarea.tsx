import type * as React from "react";

import { cn } from "@moonship/ui";
import { inputClassName } from "@moonship/ui/input";

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        inputClassName,
        "flex h-auto min-h-16 resize-y py-[7px]",
        className,
      )}
      {...props}
    />
  );
}
