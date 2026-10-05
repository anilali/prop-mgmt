export type IsoDate = string;
export type YearMonth = string;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DAY_MS = 86_400_000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function pad(value: number, length: number): string {
  return value.toString().padStart(length, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseIsoDate(date: IsoDate): DateParts {
  const match = ISO_DATE_PATTERN.exec(date);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= daysInMonth(year, month)
    ) {
      return { year, month, day };
    }
  }
  throw new Error(`Not a date: ${date}`);
}

function parseYearMonth(month: YearMonth): { year: number; month: number } {
  const match = YEAR_MONTH_PATTERN.exec(month);
  if (match) {
    const parsed = { year: Number(match[1]), month: Number(match[2]) };
    if (parsed.month >= 1 && parsed.month <= 12) return parsed;
  }
  throw new Error(`Not a month: ${month}`);
}

function format(parts: DateParts): IsoDate {
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

function toUtcMs(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): IsoDate {
  const value = new Date(ms);
  return format({
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  });
}

export function isIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

export function isYearMonth(value: string): boolean {
  try {
    parseYearMonth(value);
    return true;
  } catch {
    return false;
  }
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value.length > 0;
  } catch {
    return false;
  }
}

export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return format({ year: part("year"), month: part("month"), day: part("day") });
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export function monthOf(date: IsoDate): YearMonth {
  const { year, month } = parseIsoDate(date);
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

export function firstDay(month: YearMonth): IsoDate {
  const parsed = parseYearMonth(month);
  return format({ ...parsed, day: 1 });
}

export function lastDay(month: YearMonth): IsoDate {
  const parsed = parseYearMonth(month);
  return format({ ...parsed, day: daysInMonth(parsed.year, parsed.month) });
}

export function addMonths(month: YearMonth, n: number): YearMonth {
  const parsed = parseYearMonth(month);
  const total = parsed.year * 12 + (parsed.month - 1) + n;
  const year = Math.floor(total / 12);
  return `${pad(year, 4)}-${pad(total - year * 12 + 1, 2)}`;
}

export function monthsFromTo(from: YearMonth, to: YearMonth): YearMonth[] {
  parseYearMonth(to);
  const months: YearMonth[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

export function dayOfMonth(date: IsoDate): number {
  return parseIsoDate(date).day;
}

export function dateInMonth(month: YearMonth, day: number): IsoDate {
  const parsed = parseYearMonth(month);
  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > daysInMonth(parsed.year, parsed.month)
  ) {
    throw new Error(`Day ${day} is not in ${month}`);
  }
  return format({ ...parsed, day });
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}
