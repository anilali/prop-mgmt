import type { RouterOutputs } from "@moonship/api-operator";
import type { YearMonth } from "@moonship/shared";
import type { StatusPillVariant } from "@moonship/ui/status-pill";

export type RentStatusData = RouterOutputs["rent"]["status"];
export type RentStatusRow = RentStatusData["rows"][number];
export type RentHistory = RouterOutputs["rent"]["history"];
export type HistoryRow = RentHistory["rows"][number];
export type RentStatus = RentStatusRow["status"];
export type EntryRow = Extract<HistoryRow, { entryId: string }>;
export type LateFeeSuggestion = RentStatusRow["suggestions"][number];

export const RENT_STATUS_LABELS: Record<RentStatus | "waiting", string> = {
  behind: "Behind",
  due: "Due",
  waiting: "Waiting on bank",
  paid: "Paid",
  credit: "Credit",
};

export const RENT_STATUS_VARIANTS: Record<
  RentStatus | "waiting",
  "destructive" | "amber" | "secondary" | "green" | "blue"
> = {
  behind: "destructive",
  due: "amber",
  waiting: "secondary",
  paid: "green",
  credit: "blue",
};

export const RENT_STATUS_PILLS: Record<
  RentStatus | "waiting",
  StatusPillVariant
> = {
  behind: "behind",
  due: "due",
  waiting: "waiting",
  paid: "paid",
  credit: "credit",
};

const monthFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatMonth(month: YearMonth | null): string {
  if (!month) return "";
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined) return month;
  return monthFormat.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
