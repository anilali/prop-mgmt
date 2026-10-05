import type { IsoDate } from "@moonship/shared";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(date: IsoDate | null | undefined): string {
  if (!date) return "-";
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return date;
  }
  return dateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

export function notifiedDateFormat(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${dollars}.${remainder}`;
}

export const ACCOUNT_STATE_LABELS = {
  upcoming: "Upcoming",
  open: "Open",
  holdover: "Past end date",
  closed: "Closed",
} as const;

export const ACCOUNT_STATE_VARIANTS = {
  upcoming: "outline",
  open: "secondary",
  holdover: "destructive",
  closed: "outline",
} as const;
