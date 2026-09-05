"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@moonship/ui";

const links = [
  { href: "/property", label: "Property" },
  { href: "/tenants", label: "Tenants" },
  { href: "/leases", label: "Leases" },
] as const;

export function Sidebar({
  userName,
  isActiveStaff,
}: {
  userName: string;
  isActiveStaff: boolean;
}) {
  const pathname = usePathname();
  const visibleLinks = isActiveStaff
    ? links
    : links.filter((link) => link.href === "/property");

  return (
    <aside className="bg-muted text-foreground flex h-full w-56 flex-col gap-4 border-r p-4">
      <div>
        <p className="text-sm font-semibold">Operator</p>
        <p className="text-muted-foreground truncate text-xs">{userName}</p>
      </div>
      {!isActiveStaff ? (
        <p className="text-muted-foreground text-xs">
          Bootstrap the property to unlock tenants and leases.
        </p>
      ) : null}
      <nav className="flex flex-col gap-1">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              pathname.startsWith(link.href)
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/70",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto">
        <Link href="/" className="text-muted-foreground text-xs hover:underline">
          Home
        </Link>
      </div>
    </aside>
  );
}
