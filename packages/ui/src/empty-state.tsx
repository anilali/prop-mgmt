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
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="bg-muted text-muted-foreground rounded-full border p-3 [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold">{headline}</h3>
      {description ? (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-2 flex items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
