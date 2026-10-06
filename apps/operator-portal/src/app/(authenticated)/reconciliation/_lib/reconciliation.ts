import type { CSSProperties } from "react";

import type { RouterOutputs } from "@moonship/api-operator";
import type { StatusPillVariant } from "@moonship/ui/status-pill";
import { firstReconciliationYear } from "@moonship/billing";

export type YearList = RouterOutputs["reconciliation"]["listYears"];
export type YearRow = YearList["years"][number];
export type YearStatus = YearRow["status"];
export type Workspace = RouterOutputs["reconciliation"]["workspace"];
export type PoolView = Workspace["pools"][number];
export type StatementView = Workspace["statements"][number];
export type ChecklistItem = Workspace["checklist"][number];
export type FinalizedView = NonNullable<Workspace["finalized"]>;

export const YEAR_STATUS_LABELS: Record<YearStatus, string> = {
  draft: "Open",
  finalized: "Finalized",
};

export const YEAR_STATUS_VARIANTS = {
  draft: "due",
  finalized: "paid",
} as const satisfies Record<YearStatus, StatusPillVariant>;

export const YEAR_TABS = ["checklist", "pools", "letters"] as const;
export type YearTab = (typeof YEAR_TABS)[number];

export function parseYearTab(value: string | null): YearTab {
  return YEAR_TABS.find((tab) => tab === value) ?? "checklist";
}

export function riseStyle(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function blockerCount(workspace: Workspace): number {
  return workspace.checklist.filter((item) => item.severity === "blocker")
    .length;
}

export function missingAddressTenantIds(workspace: Workspace): Set<string> {
  return new Set(
    workspace.checklist.flatMap((item) =>
      item.code === "missing_mailing_address" && item.tenantId
        ? [item.tenantId]
        : [],
    ),
  );
}

export function yearsUnavailableMessage(list: YearList): string | null {
  if (list.trackingStart === null) {
    return "Set the tracking start date in Setup before opening a reconciliation.";
  }
  if (list.years.length > 0) return null;
  const firstYear = firstReconciliationYear(list.trackingStart);
  return `The first reconciliation is ${firstYear}, the first full year after the tracking start date.`;
}

function base64ToPdfUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export function showPdf(
  tab: Window | null,
  base64: string,
  fileName: string,
): void {
  const url = base64ToPdfUrl(base64);
  if (tab && !tab.closed) {
    tab.location.href = url;
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
