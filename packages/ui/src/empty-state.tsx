import type { ReactNode } from "react";

import { cn } from "@moonship/ui";

export interface EmptyStateProps {
  icon?: ReactNode;
  headline: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  headline,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "border-line-2 text-fg-2 flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed px-5 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="text-fg-3 [&_svg]:size-5 [&_svg]:shrink-0">{icon}</div>
      ) : null}
      <h3 className="text-foreground text-[14px] font-semibold">{headline}</h3>
      {description ? (
        <p className="text-fg-2 max-w-sm text-[12.5px]">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-2 flex items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
