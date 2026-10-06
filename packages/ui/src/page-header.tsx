import type { ReactNode } from "react";

import { cn } from "@moonship/ui";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-fg-3 mb-1 text-[11px] font-semibold tracking-[0.06em] uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.015em] text-balance">
          {title}
        </h1>
        {description ? (
          <p className="text-fg-2 mt-[3px] text-[13px]">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-1.5">{action}</div>
      ) : null}
    </div>
  );
}
