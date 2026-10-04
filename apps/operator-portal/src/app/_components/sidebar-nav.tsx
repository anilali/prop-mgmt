"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  Send,
  Settings,
  Users,
} from "lucide-react";

import { cn } from "@moonship/ui";
import { Separator } from "@moonship/ui/separator";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  activePaths: string[];
  chevron?: boolean;
}

const mainItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/property",
    icon: LayoutDashboard,
    activePaths: ["/property"],
  },
  {
    label: "Tasks",
    href: "/leases",
    icon: ClipboardList,
    activePaths: [],
  },
  {
    label: "Applicants",
    href: "/tenants",
    icon: Users,
    activePaths: ["/tenants"],
    chevron: true,
  },
  {
    label: "Events",
    href: "/events",
    icon: CalendarDays,
    activePaths: ["/events"],
  },
];

const accessItem: NavItem = {
  label: "Access",
  href: "/access",
  icon: KeyRound,
  activePaths: ["/access"],
};

const secondaryItems: NavItem[] = [
  { label: "Outgoing", href: "/leases", icon: Send, activePaths: [] },
  { label: "Settings", href: "/property", icon: Settings, activePaths: [] },
];

const platformItems: NavItem[] = [
  {
    label: "Properties",
    href: "/platform/properties",
    icon: Building2,
    activePaths: ["/platform/properties"],
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
      {item.chevron ? (
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      ) : null}
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
  const primaryItems =
    mode === "platform"
      ? platformItems
      : [...mainItems, ...(role === "admin" ? [accessItem] : [])];
  const showSecondary = mode === "property";
  const items = showSecondary
    ? [...primaryItems, ...secondaryItems]
    : primaryItems;
  const isActive = (item: NavItem) =>
    item.activePaths.some((prefix) => pathname.startsWith(prefix));
  const anyActive = items.some((item) => isActive(item));
  const isSelected = (item: NavItem) =>
    isActive(item) || (!anyActive && item.label === "Events");

  return (
    <nav className="flex flex-col gap-0.5">
      {primaryItems.map((item) => (
        <SidebarNavItem key={item.label} item={item} selected={isSelected(item)} />
      ))}
      {showSecondary ? (
        <>
          <Separator className="my-2" />
          {secondaryItems.map((item) => (
            <SidebarNavItem
              key={item.label}
              item={item}
              selected={isSelected(item)}
            />
          ))}
        </>
      ) : null}
    </nav>
  );
}
