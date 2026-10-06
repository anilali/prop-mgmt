import type { ReactNode } from "react";

import { cn } from "@moonship/ui";

export function FormField({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-[5px]", className)}>
      <span className="text-fg-2 text-[12px] font-medium">{label}</span>
      {children}
      {hint ? <small className="text-fg-3 text-[11.5px]">{hint}</small> : null}
    </label>
  );
}

export function StepHeading({
  number,
  children,
}: {
  number: number;
  children: ReactNode;
}) {
  return (
    <h3 className="mt-1.5 flex items-center gap-2 text-[13px] font-semibold">
      <span className="bg-accent-soft text-primary grid size-5 place-items-center rounded-[5px] font-mono text-[11px] font-medium">
        {number}
      </span>
      {children}
    </h3>
  );
}
