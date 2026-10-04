import type { ReactNode } from "react";

import { cn } from "@moonship/ui";

export interface ToolbarProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Toolbar({ left, right, className, children }: ToolbarProps) {
  return (
    <div
      data-slot="toolbar"
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {left}
        {children}
      </div>
      {right ? (
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      ) : null}
    </div>
  );
}
