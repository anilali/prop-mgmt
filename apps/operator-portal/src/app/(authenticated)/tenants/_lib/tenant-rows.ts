import type { RouterOutputs } from "@moonship/api-operator";
import type { IsoDate } from "@moonship/shared";

import type { RentHistory, RentStatus, RentStatusData } from "../../_lib/rent";
import type { AccountSummary, Lease } from "./lease-form";
import { newestLease } from "./lease-form";

type AccountList = RouterOutputs["account"]["list"];
type YearList = RouterOutputs["reconciliation"]["listYears"];
type MonthRow = RentStatusData["rows"][number]["months"][number];

export interface TenantRow {
  accountId: string;
  tenantName: string;
  unitLabel: string;
  state: AccountSummary["state"];
  status: RentStatus;
  months: MonthRow[];
  monthlyCents: number;
  pastDueCents: number;
  balanceCents: number;
  past: boolean;
  newest: Lease | undefined;
  endDate: IsoDate | null;
  startDate: IsoDate;
}

const STATUS_ORDER: RentStatus[] = [
  "behind",
  "due",
  "waiting",
  "paid",
  "credit",
];

const STATE_ORDER: AccountSummary["state"][] = [
  "holdover",
  "open",
  "upcoming",
  "closed",
];

function overlapsYear(account: AccountSummary, today: IsoDate): boolean {
  const year = today.slice(0, 4);
  return (
    account.startDate <= `${year}-12-31` &&
    (account.endDate === null || account.endDate >= `${year}-01-01`)
  );
}

export function accountsNeedingHistory(
  status: RentStatusData,
  list: AccountList,
): string[] {
  const shown = new Set(status.rows.map((row) => row.accountId));
  return list.accounts
    .filter(
      (account) =>
        !shown.has(account.id) && overlapsYear(account, status.today),
    )
    .map((account) => account.id);
}

function offMonths(): MonthRow[] {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    state: "off" as const,
    expectedCents: 0,
    paidCents: 0,
  }));
}

function monthlyFrom(months: MonthRow[], today: IsoDate): number {
  const current = Number(today.slice(5, 7));
  const now = months[current - 1]?.expectedCents ?? 0;
  if (now > 0) return now;
  return (
    months.find((cell) => cell.month > current && cell.expectedCents > 0)
      ?.expectedCents ?? 0
  );
}

function closedYears(years: YearList): (year: number) => boolean {
  const listed = years.years.map((row) => row.year);
  const first = listed.length > 0 ? Math.min(...listed) : Infinity;
  const finalized = new Set(
    years.years
      .filter((row) => row.status === "finalized")
      .map((row) => row.year),
  );
  return (year) => year < first || finalized.has(year);
}

export function tenantRows(
  status: RentStatusData,
  list: AccountList,
  histories: readonly RentHistory[],
  years: YearList,
): TenantRow[] {
  const isClosedYear = closedYears(years);
  const rows = list.accounts.map((account): TenantRow => {
    const summary =
      status.rows.find((row) => row.accountId === account.id) ??
      histories.find((history) => history.account.id === account.id);
    const months = summary?.months ?? offMonths();
    const balanceCents = summary?.balanceCents ?? 0;
    return {
      accountId: account.id,
      tenantName: account.tenant.businessName,
      unitLabel: account.unit.label,
      state: account.state,
      status: summary?.status ?? "paid",
      months,
      monthlyCents: monthlyFrom(months, status.today),
      pastDueCents: summary?.pastDueCents ?? 0,
      balanceCents,
      past:
        account.state === "closed" &&
        balanceCents === 0 &&
        account.endDate !== null &&
        isClosedYear(Number(account.endDate.slice(0, 4))),
      newest: newestLease(account.leases),
      endDate: account.endDate,
      startDate: account.startDate,
    };
  });
  return rows.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      b.balanceCents - a.balanceCents ||
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true }),
  );
}
