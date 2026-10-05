"use client";

import Link from "next/link";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

import { cn } from "@moonship/ui";

import type { ChecklistItem } from "../../_lib/reconciliation";

interface FixLink {
  href: string;
  label: string;
}

function fixLink(item: ChecklistItem): FixLink | null {
  switch (item.code) {
    case "unsorted_transactions":
      return { href: "/transactions", label: "Sort transactions" };
    case "pool_has_no_units":
    case "pool_members_changed":
      return { href: "/setup", label: "Open pools in Setup" };
    case "unit_not_in_pool":
      return item.accountId
        ? { href: `/leases/${item.accountId}`, label: "Open the account" }
        : { href: "/setup", label: "Open pools in Setup" };
    case "unit_sqft_changed":
      return { href: "/setup", label: "Open units in Setup" };
    case "negative_actual":
    case "bill_amount_missing":
      return item.poolId
        ? { href: `#pool-${item.poolId}`, label: "Go to the pool" }
        : null;
    case "missing_letter_details":
      return { href: "/setup", label: "Open letter details in Setup" };
    case "missing_mailing_address":
      return item.tenantId ? { href: "/tenants", label: "Open Tenants" } : null;
    case "statement_incomplete":
    case "holdover":
      return item.accountId
        ? { href: `/leases/${item.accountId}`, label: "Open the account" }
        : null;
    case "bank_data_through":
      return { href: "/transactions/import", label: "Import CSV" };
  }
}

function ChecklistGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: ChecklistItem[];
  tone: "blocker" | "warning";
}) {
  const Icon = tone === "blocker" ? CircleAlert : TriangleAlert;
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-4",
        tone === "blocker"
          ? "border-destructive/40 bg-destructive/5"
          : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
      )}
    >
      <h3
        className={cn(
          "flex items-center gap-2 text-sm font-medium",
          tone === "blocker"
            ? "text-destructive"
            : "text-amber-800 dark:text-amber-300",
        )}
      >
        <Icon className="size-4" />
        {title} ({items.length})
      </h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, index) => {
          const link = fixLink(item);
          return (
            <li
              key={`${item.code}-${item.poolId ?? ""}-${item.accountId ?? ""}-${item.tenantId ?? ""}-${item.unitId ?? ""}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2"
            >
              <span>{item.message}</span>
              {link ? (
                <Link
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                  href={link.href}
                >
                  {link.label}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Checklist({
  year,
  items,
}: {
  year: number;
  items: ChecklistItem[];
}) {
  const blockers = items.filter((item) => item.severity === "blocker");
  const warnings = items.filter((item) => item.severity === "warning");

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Checklist</h2>
      {blockers.length === 0 ? (
        <p className="flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 text-emerald-600" />
          Nothing in the {year} data blocks finalize.
        </p>
      ) : (
        <ChecklistGroup
          title="Fix before finalizing"
          items={blockers}
          tone="blocker"
        />
      )}
      {warnings.length > 0 ? (
        <ChecklistGroup title="Check these" items={warnings} tone="warning" />
      ) : null}
    </section>
  );
}
