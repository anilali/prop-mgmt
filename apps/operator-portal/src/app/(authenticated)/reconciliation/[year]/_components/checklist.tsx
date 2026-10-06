"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";

import type {
  ChecklistItem,
  Workspace,
  YearRow,
} from "../../_lib/reconciliation";
import { blockerCount, plural, riseStyle } from "../../_lib/reconciliation";
import { formatDate } from "../../../_lib/format";

type Fix =
  | { kind: "link"; href: string; label: string }
  | { kind: "bill"; poolId: string; label: string };

function accountHref(accountId: string): string {
  return `/tenants/${accountId}?tab=lease`;
}

function fixFor(item: ChecklistItem, workspace: Workspace): Fix | null {
  const poolsTab = `/reconciliation/${workspace.year}?tab=pools`;
  switch (item.code) {
    case "unsorted_transactions":
      return {
        kind: "link",
        href: "/transactions",
        label: "Sort transactions",
      };
    case "pool_has_no_units":
    case "pool_members_changed":
      return { kind: "link", href: "/setup?tab=units", label: "Open pools" };
    case "unit_not_in_pool":
      return item.accountId
        ? {
            kind: "link",
            href: accountHref(item.accountId),
            label: "Open lease",
          }
        : { kind: "link", href: "/setup?tab=units", label: "Open pools" };
    case "unit_sqft_changed":
      return { kind: "link", href: "/setup?tab=units", label: "Open units" };
    case "negative_actual":
      return item.poolId
        ? {
            kind: "link",
            href: `${poolsTab}#pool-${item.poolId}`,
            label: "Open pool",
          }
        : null;
    case "bill_amount_missing":
      return item.poolId
        ? { kind: "bill", poolId: item.poolId, label: "Enter bill amount" }
        : null;
    case "missing_letter_details":
      return {
        kind: "link",
        href: "/setup?tab=property",
        label: "Add letter details",
      };
    case "missing_mailing_address": {
      const accountId =
        item.accountId ??
        workspace.statements.find((s) => s.tenantId === item.tenantId)
          ?.accountId;
      return {
        kind: "link",
        href: accountId ? `/tenants/${accountId}` : "/tenants",
        label: "Add mailing address",
      };
    }
    case "statement_incomplete":
    case "holdover":
    case "estimate_carried_over":
      return item.accountId
        ? {
            kind: "link",
            href: accountHref(item.accountId),
            label: "Open lease",
          }
        : null;
    case "bank_data_through":
      return {
        kind: "link",
        href: "/transactions/import",
        label: "Import bank file",
      };
  }
}

function FixButton({
  fix,
  onEnterBill,
}: {
  fix: Fix;
  onEnterBill: (poolId: string) => void;
}) {
  if (fix.kind === "bill") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onEnterBill(fix.poolId)}
      >
        {fix.label}
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" asChild>
      <Link href={fix.href}>{fix.label}</Link>
    </Button>
  );
}

type RequirementState = "ok" | "no" | "wait";

interface Requirement {
  key: string;
  state: RequirementState;
  text: string;
  action?: ReactNode;
}

const REQUIREMENT_ICONS = {
  ok: <CircleCheck className="text-green size-4" />,
  no: <CircleX className="text-red size-4" />,
  wait: <Clock className="text-fg-3 size-4" />,
} as const satisfies Record<RequirementState, ReactNode>;

function requirements(workspace: Workspace, years: YearRow[]): Requirement[] {
  const { year, gates, letterDate } = workspace;
  const blockers = blockerCount(workspace);
  const lettersTab = `/reconciliation/${year}?tab=letters`;
  const rows: Requirement[] = [
    blockers > 0
      ? {
          key: "blockers",
          state: "no",
          text: `${plural(blockers, "item", "items")} in the ${year} data to fix`,
        }
      : {
          key: "blockers",
          state: "ok",
          text: `Nothing in the ${year} data blocks finalizing`,
        },
  ];

  if (letterDate === null) {
    rows.push({
      key: "letter",
      state: "no",
      text: "Letter date not set",
      action: (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={lettersTab}>Set letter date</Link>
        </Button>
      ),
    });
  } else if (!gates.letterDateAfterYearEnd) {
    rows.push({
      key: "letter",
      state: "no",
      text: `The letter date (${formatDate(letterDate)}) must be after ${formatDate(`${year}-12-31`)}`,
      action: (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={lettersTab}>Change letter date</Link>
        </Button>
      ),
    });
  } else {
    rows.push({
      key: "letter",
      state: "ok",
      text: `Letter date set to ${formatDate(letterDate)}`,
    });
  }

  rows.push(
    gates.todayAfterYearEnd
      ? { key: "over", state: "ok", text: `${year} is over` }
      : {
          key: "over",
          state: "wait",
          text: `The year has to be over. Finalizing opens ${formatDate(`${year + 1}-01-01`)}.`,
        },
  );

  const previous = year - 1;
  if (!gates.previousYearFinalized) {
    rows.push({
      key: "previous",
      state: "no",
      text: `Finalize ${previous} first`,
      action: (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={`/reconciliation/${previous}`}>Open {previous}</Link>
        </Button>
      ),
    });
  } else if (
    years.some((row) => row.year === previous && row.status === "finalized")
  ) {
    rows.push({
      key: "previous",
      state: "ok",
      text: `${previous} is finalized`,
    });
  }

  return rows;
}

function ChecklistGroup({
  title,
  items,
  tone,
  workspace,
  onEnterBill,
}: {
  title: string;
  items: ChecklistItem[];
  tone: "blocker" | "warning";
  workspace: Workspace;
  onEnterBill: (poolId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <h2 className="label-caps">{title}</h2>
        <span className="text-fg-3 font-mono text-[11px] font-medium">
          {items.length}
        </span>
      </div>
      <div className="border-line overflow-hidden rounded-lg border">
        {items.map((item, index) => {
          const fix = fixFor(item, workspace);
          return (
            <div
              key={`${item.code}-${item.poolId ?? ""}-${item.accountId ?? ""}-${item.tenantId ?? ""}-${item.unitId ?? ""}-${index}`}
              className="border-line animate-rise grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-t px-3.5 py-2.5 first:border-t-0"
              style={riseStyle(index)}
            >
              {tone === "blocker" ? (
                <CircleAlert className="text-red size-4" />
              ) : (
                <TriangleAlert className="text-amber size-4" />
              )}
              <span>{item.message}</span>
              {fix ? (
                <FixButton fix={fix} onEnterBill={onEnterBill} />
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Checklist({
  workspace,
  years,
  onEnterBill,
}: {
  workspace: Workspace;
  years: YearRow[];
  onEnterBill: (poolId: string) => void;
}) {
  const blockers = workspace.checklist.filter(
    (item) => item.severity === "blocker",
  );
  const warnings = workspace.checklist.filter(
    (item) => item.severity === "warning",
  );

  return (
    <div className="max-w-[880px] space-y-[22px]">
      <section className="space-y-2">
        <h2 className="label-caps px-0.5">To finalize</h2>
        <div className="border-line animate-rise overflow-hidden rounded-lg border">
          {requirements(workspace, years).map((row) => (
            <div
              key={row.key}
              className={cn(
                "border-line grid min-h-11 grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-t px-3.5 py-2.5 first:border-t-0",
                row.state === "wait" && "text-fg-2",
              )}
            >
              {REQUIREMENT_ICONS[row.state]}
              <span>{row.text}</span>
              {row.action ?? <span />}
            </div>
          ))}
        </div>
      </section>
      <ChecklistGroup
        title="Fix before finalizing"
        items={blockers}
        tone="blocker"
        workspace={workspace}
        onEnterBill={onEnterBill}
      />
      <ChecklistGroup
        title="Check these"
        items={warnings}
        tone="warning"
        workspace={workspace}
        onEnterBill={onEnterBill}
      />
    </div>
  );
}
