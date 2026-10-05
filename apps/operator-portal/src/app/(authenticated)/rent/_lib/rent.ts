import type { RouterOutputs } from "@moonship/api-operator";
import type { YearMonth } from "@moonship/shared";

export type RentStatusData = RouterOutputs["rent"]["status"];
export type RentStatusRow = RentStatusData["rows"][number];
export type RentHistory = RouterOutputs["rent"]["history"];
export type HistoryRow = RentHistory["rows"][number];
export type RentStatus = RentStatusRow["status"];
export type EntryRow = Extract<HistoryRow, { entryId: string }>;

export const RENT_STATUS_LABELS: Record<RentStatus, string> = {
  behind: "Behind",
  due: "Due",
  paid: "Paid",
  credit: "Credit",
};

export const RENT_STATUS_VARIANTS = {
  behind: "destructive",
  due: "default",
  paid: "secondary",
  credit: "outline",
} as const satisfies Record<RentStatus, string>;

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
