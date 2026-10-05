"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Building2,
  Calculator,
  FileText,
  KeyRound,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@moonship/ui";
import { Separator } from "@moonship/ui/separator";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Users;
}

const propertyMainItems: NavItem[] = [
  { label: "Rent", href: "/rent", icon: Wallet },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { label: "Reconciliation", href: "/reconciliation", icon: Calculator },
];

const propertyItems: NavItem[] = [
  { label: "Tenants", href: "/tenants", icon: Users },
  { label: "Leases", href: "/leases", icon: FileText },
  { label: "Setup", href: "/setup", icon: Settings },
];

const accessItem: NavItem = {
  label: "Access",
  href: "/access",
  icon: KeyRound,
};

const platformItems: NavItem[] = [
  {
    label: "Properties",
    href: "/platform/properties",
    icon: Building2,
  },
];

function SidebarNavItem({
  item,
  selected,
}: {
  item: NavItem;
  selected: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        selected
          ? "bg-background text-foreground font-medium shadow-sm"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

export function SidebarNav({
  mode,
  role,
}: {
  mode: "property" | "platform";
  role?: "admin" | "staff";
}) {
  const pathname = usePathname();
  const groups =
    mode === "platform"
      ? [platformItems]
      : [
          propertyMainItems,
          [...propertyItems, ...(role === "admin" ? [accessItem] : [])],
        ];
  const isSelected = (item: NavItem) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((items, index) => (
        <Fragment key={items[0]?.href ?? index}>
          {index > 0 ? <Separator className="my-2" /> : null}
          {items.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              selected={isSelected(item)}
            />
          ))}
        </Fragment>
      ))}
    </nav>
  );
}
