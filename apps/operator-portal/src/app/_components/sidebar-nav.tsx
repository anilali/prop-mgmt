"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Building2,
  Calculator,
  House,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { cn } from "@moonship/ui";

import { useTRPC } from "~/trpc/react";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Users;
}

const homeItem: NavItem = { label: "Home", href: "/home", icon: House };
const transactionsItem: NavItem = {
  label: "Transactions",
  href: "/transactions",
  icon: ArrowLeftRight,
};
const tenantsItem: NavItem = {
  label: "Tenants",
  href: "/tenants",
  icon: Users,
};
const reconciliationItem: NavItem = {
  label: "Reconciliation",
  href: "/reconciliation",
  icon: Calculator,
};
const setupItem: NavItem = {
  label: "Setup",
  href: "/setup",
  icon: SlidersHorizontal,
};
const propertiesItem: NavItem = {
  label: "Properties",
  href: "/platform/properties",
  icon: Building2,
};

function isUnder(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNavItem({
  item,
  count,
  onNavigate,
}: {
  item: NavItem;
  count?: ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const selected = isUnder(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={selected ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-[29px] items-center gap-[9px] rounded-md px-2 font-medium transition-colors duration-100",
        selected
          ? "bg-press text-foreground"
          : "text-fg-2 hover:bg-hover hover:text-foreground",
      )}
    >
      <Icon className="size-[15px] shrink-0" strokeWidth={1.7} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count}
    </Link>
  );
}

function ToSortCount() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.transaction.listToSort.queryOptions());
  if (data.length === 0) return null;
  return (
    <span className="bg-accent-soft text-primary h-[18px] rounded-[9px] px-1.5 font-mono text-[11px] leading-[18px] font-medium">
      {data.length}
    </span>
  );
}

function BehindCount() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.rent.status.queryOptions());
  const behind = data.rows.filter((row) => row.status === "behind").length;
  if (!behind) return null;
  return (
    <span className="text-fg-3 font-mono text-[11px] font-medium">
      {behind} behind
    </span>
  );
}

export function SidebarNav({
  mode,
  onNavigate,
}: {
  mode: "property" | "platform";
  onNavigate?: () => void;
}) {
  if (mode === "platform") {
    return (
      <nav aria-label="Main" className="flex flex-col gap-px">
        <SidebarNavItem item={propertiesItem} onNavigate={onNavigate} />
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex flex-col gap-px">
      <SidebarNavItem item={homeItem} onNavigate={onNavigate} />
      <SidebarNavItem
        item={transactionsItem}
        count={
          <Suspense fallback={null}>
            <ToSortCount />
          </Suspense>
        }
        onNavigate={onNavigate}
      />
      <SidebarNavItem
        item={tenantsItem}
        count={
          <Suspense fallback={null}>
            <BehindCount />
          </Suspense>
        }
        onNavigate={onNavigate}
      />
      <SidebarNavItem item={reconciliationItem} onNavigate={onNavigate} />
      <div className="label-caps px-2 pt-2.5 pb-1">Property</div>
      <SidebarNavItem item={setupItem} onNavigate={onNavigate} />
    </nav>
  );
}
