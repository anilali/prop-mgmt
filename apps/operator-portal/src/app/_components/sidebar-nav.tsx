"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, KeyRound, Settings, Users } from "lucide-react";

import { cn } from "@moonship/ui";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Users;
}

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
  const items =
    mode === "platform"
      ? platformItems
      : [...propertyItems, ...(role === "admin" ? [accessItem] : [])];
  const isSelected = (item: NavItem) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <SidebarNavItem
          key={item.href}
          item={item}
          selected={isSelected(item)}
        />
      ))}
    </nav>
  );
}
