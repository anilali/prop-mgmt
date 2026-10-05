import type { RouterOutputs } from "@moonship/api-operator";
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
  draft: "Draft",
  finalized: "Finalized",
};

export const YEAR_STATUS_VARIANTS = {
  draft: "outline",
  finalized: "secondary",
} as const satisfies Record<YearStatus, string>;

export function yearsUnavailableMessage(list: YearList): string | null {
  if (list.trackingStart === null) {
    return "Set the tracking start date in Setup before opening a reconciliation.";
  }
  if (list.years.length > 0) return null;
  const firstYear = firstReconciliationYear(list.trackingStart);
  return `The first reconciliation is ${firstYear}, the first full year after the tracking start date.`;
}

export function timestampFormat(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
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
