import type { ReactNode } from "react";

import { cn } from "@moonship/ui";

export function Card({
  title,
  action,
  className,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("border-line bg-panel rounded-[9px] border", className)}
    >
      <div className="border-line flex min-h-[45px] items-center justify-between gap-2.5 border-b px-3.5 py-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {action ? <div className="flex gap-1.5">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function CardRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2 [&+&]:border-t",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardEmpty({ children }: { children: ReactNode }) {
  return <p className="text-fg-2 px-3.5 py-3 text-[12.5px]">{children}</p>;
}
