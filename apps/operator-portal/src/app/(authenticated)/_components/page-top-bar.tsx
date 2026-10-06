"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";

import { useShell } from "~/app/_components/shell-context";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageTopBar({
  crumbs,
  actions,
  className,
}: {
  crumbs: Crumb[];
  actions?: ReactNode;
  className?: string;
}) {
  const { openNav } = useShell();

  return (
    <header
      className={cn(
        "bg-panel border-line nav:pr-3.5 nav:pl-[18px] sticky top-0 z-10 flex h-[46px] shrink-0 items-center gap-2.5 border-b px-2.5",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        className="nav:hidden"
        onClick={openNav}
      >
        <Menu className="size-[15px]" strokeWidth={1.7} />
      </Button>
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-[7px] font-medium"
      >
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${index}-${crumb.label}`}>
              {index > 0 ? (
                <span aria-hidden className="text-fg-3">
                  /
                </span>
              ) : null}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="text-fg-2 hover:text-foreground shrink-0 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(last ? "truncate" : "text-fg-2 shrink-0")}
                >
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </header>
  );
}
