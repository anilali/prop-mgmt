import type { ReactNode } from "react";

import { cn } from "@moonship/ui";
import { Label } from "@moonship/ui/label";

export function FormField({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-[5px]", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <small className="text-fg-3 text-[11.5px]">{hint}</small> : null}
    </div>
  );
}
