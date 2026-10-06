import type { IsoDate, YearMonth } from "@moonship/shared";

import { formatDate, formatMonthDay } from "../../_lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(date: IsoDate): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / DAY_MS);
}

export function daysAway(from: IsoDate, to: IsoDate): string {
  const days = daysBetween(from, to);
  if (days === 0) return "Today.";
  if (days === 1) return "Tomorrow.";
  return `${days} days away.`;
}

export function shortDate(date: IsoDate, today: IsoDate): string {
  return date.slice(0, 4) === today.slice(0, 4)
    ? formatMonthDay(date)
    : formatDate(date);
}

const headingFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export function dayHeading(today: IsoDate): string {
  return headingFormat.format(utcDate(today));
}

const monthNameFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

export function monthName(month: YearMonth): string {
  return monthNameFormat.format(utcDate(`${month}-01`));
}

export const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
