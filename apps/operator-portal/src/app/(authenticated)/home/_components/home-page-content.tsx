"use client";

import { useState } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  Check,
  CircleAlert,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  Upload,
  UserPlus,
} from "lucide-react";

import type { IsoDate, YearMonth } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import { formatMoney } from "@moonship/ui/money";

import type { RentStatusRow } from "../../_lib/rent";
import type { LateFeeOutcome } from "./todo-actions";
import type { TodoItem } from "./todo-list";
import { useTRPC } from "~/trpc/react";
import { dayHeading, daysAway, monthName, shortDate } from "../_lib/dates";
import { PageTopBar } from "../../_components/page-top-bar";
import { notifiedDateFormat } from "../../_lib/format";
import { BalancesCard } from "./balances-card";
import { RentChartCard } from "./rent-chart-card";
import { LateFeeActions, NotifyAction } from "./todo-actions";
import { AccountLink, AlsoChecked, rise, TodoGroup } from "./todo-list";

interface DecidedFee {
  key: string;
  accountId: string;
  tenant: { businessName: string };
  unit: { label: string };
  month: YearMonth;
  amountCents: number;
  outcome: LateFeeOutcome;
}

function feeKey(accountId: string, month: YearMonth): string {
  return `${accountId}-${month}`;
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function LinkButton({
  href,
  primary = false,
  children,
}: {
  href: string;
  primary?: boolean;
  children: string;
}) {
  return (
    <Button size="sm" variant={primary ? "primary" : "outline"} asChild>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function leaseHref(accountId: string): string {
  return `/tenants/${accountId}?tab=lease`;
}

function paidSoFar(
  rows: RentStatusRow[],
  accountId: string,
  month: YearMonth,
  today: IsoDate,
): string {
  if (month.slice(0, 4) !== today.slice(0, 4)) return "";
  const cell = rows
    .find((row) => row.accountId === accountId)
    ?.months.find((m) => m.month === Number(month.slice(5, 7)));
  if (!cell || cell.expectedCents === 0) return "";
  return ` Paid so far: ${formatMoney(cell.paidCents)} of ${formatMoney(cell.expectedCents)}.`;
}

export function HomePageContent({ propertyName }: { propertyName: string }) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.home.comingUp.queryOptions());
  const { data: status } = useSuspenseQuery(trpc.rent.status.queryOptions());
  const { data: bank } = useSuspenseQuery(trpc.rent.bankStatus.queryOptions());
  const { data: toSort } = useSuspenseQuery(
    trpc.transaction.listToSort.queryOptions(),
  );
  const [decidedFees, setDecidedFees] = useState<DecidedFee[]>([]);
  const [notifiedSteps, setNotifiedSteps] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const today = data.today;
  const notifiedFormat = notifiedDateFormat(data.timeZone);
  const hasAccounts = data.accountCount > 0;
  const tracking = data.trackingStart !== null;
  const now: TodoItem[] = [];
  const soon: TodoItem[] = [];
  const done: TodoItem[] = [];

  if (!tracking) {
    now.push({
      key: "tracking",
      tone: "amber",
      icon: SlidersHorizontal,
      title: "Set the tracking start date",
      meta: "Rent and balances are counted from this date.",
      actions: (
        <LinkButton href="/setup?tab=property" primary>
          Open setup
        </LinkButton>
      ),
    });
  }

  if (!hasAccounts) {
    now.push({
      key: "first-tenant",
      tone: "accent",
      icon: UserPlus,
      title: "Add your first tenant",
      meta: "Rent, balances, and lease reminders show here once a tenant has a lease.",
      actions: (
        <LinkButton href="/tenants?new=1" primary={tracking}>
          New tenant
        </LinkButton>
      ),
    });
  }

  const currentMonth = today.slice(0, 7);
  const needsImport =
    bank.newestBankDate === null || bank.newestBankDate < `${currentMonth}-01`;
  if (needsImport) {
    const name = monthName(currentMonth);
    now.push({
      key: "import",
      tone: "amber",
      icon: Upload,
      title: `Import ${name} bank activity`,
      meta: bank.newestBankDate
        ? `Bank data ends ${shortDate(bank.newestBankDate, today)}. Until you import, ${name} rent shows as not known yet.`
        : `No bank data yet. Until you import, rent shows as not known.`,
      actions: (
        <LinkButton href="/transactions/import" primary>
          Import bank file
        </LinkButton>
      ),
    });
  }

  if (toSort.length > 0) {
    const deposits = toSort.filter((txn) => txn.amountCents > 0).length;
    const expenses = toSort.length - deposits;
    const parts = [
      deposits > 0 ? plural(deposits, "deposit") : null,
      expenses > 0 ? plural(expenses, "expense") : null,
    ].filter((part) => part !== null);
    now.push({
      key: "sort",
      tone: "accent",
      icon: ArrowLeftRight,
      title: `Sort ${plural(toSort.length, "transaction")}`,
      meta: `${parts.join(" and ")}.${deposits > 0 ? " Deposits count toward balances once sorted." : ""}`,
      actions: (
        <LinkButton href="/transactions" primary={!needsImport}>
          Start sorting
        </LinkButton>
      ),
    });
  }

  const decidedKeys = new Set(decidedFees.map((fee) => fee.key));
  const pendingFees = data.lateFees.flatMap((account) =>
    account.suggestions
      .filter((s) => !decidedKeys.has(feeKey(account.accountId, s.month)))
      .map((s) => ({ ...s, tenant: account.tenant, unit: account.unit })),
  );
  for (const fee of pendingFees) {
    const key = feeKey(fee.accountId, fee.month);
    now.push({
      key: `fee-${key}`,
      tone: "red",
      icon: CircleAlert,
      title: (
        <>
          Approve a {formatMoney(fee.amountCents)} late fee for{" "}
          <AccountLink
            accountId={fee.accountId}
            tenant={fee.tenant}
            unit={fee.unit}
          />
        </>
      ),
      meta: `${monthName(fee.month)} rent was not paid in full by ${shortDate(fee.feeDate, today)}.${paidSoFar(status.rows, fee.accountId, fee.month, today)}`,
      actions: (
        <LateFeeActions
          accountId={fee.accountId}
          month={fee.month}
          onDecided={(outcome) =>
            setDecidedFees((list) => [
              ...list,
              {
                key,
                accountId: fee.accountId,
                tenant: fee.tenant,
                unit: fee.unit,
                month: fee.month,
                amountCents: fee.amountCents,
                outcome,
              },
            ])
          }
        />
      ),
    });
  }

  for (const item of data.insurance) {
    const name = (
      <AccountLink
        accountId={item.accountId}
        tenant={item.tenant}
        unit={item.unit}
      />
    );
    if (item.problem === "missing" || item.insuranceExpiresOn === null) {
      now.push({
        key: `insurance-${item.leaseId}`,
        tone: "red",
        icon: ShieldAlert,
        title: <>No insurance certificate for {name}</>,
        meta: "Nothing on file.",
        actions: (
          <LinkButton href={leaseHref(item.accountId)}>
            Add expiry date
          </LinkButton>
        ),
      });
    } else if (item.problem === "expired") {
      now.push({
        key: `insurance-${item.leaseId}`,
        tone: "red",
        icon: ShieldAlert,
        title: (
          <>
            {name} insurance expired {shortDate(item.insuranceExpiresOn, today)}
          </>
        ),
        meta: "Ask the tenant for a current certificate.",
        actions: (
          <LinkButton href={leaseHref(item.accountId)}>
            Update expiry
          </LinkButton>
        ),
      });
    } else {
      soon.push({
        key: `insurance-${item.leaseId}`,
        tone: "amber",
        icon: ShieldAlert,
        title: (
          <>
            {name} insurance expires {shortDate(item.insuranceExpiresOn, today)}
          </>
        ),
        meta: daysAway(today, item.insuranceExpiresOn),
        actions: (
          <LinkButton href={leaseHref(item.accountId)}>
            Update expiry
          </LinkButton>
        ),
      });
    }
  }

  for (const item of data.pastEndDate) {
    now.push({
      key: `ended-${item.accountId}`,
      tone: "red",
      icon: CalendarClock,
      title: (
        <>
          <AccountLink
            accountId={item.accountId}
            tenant={item.tenant}
            unit={item.unit}
          />{" "}
          lease ended {shortDate(item.endDate, today)}
        </>
      ),
      meta: "No renewal or move-out date. Rent is still expected on the old terms.",
      actions: (
        <>
          <LinkButton href={leaseHref(item.accountId)}>Set move-out</LinkButton>
          <LinkButton href={leaseHref(item.accountId)}>Add renewal</LinkButton>
        </>
      ),
    });
  }

  const pendingRentChanges = data.rentChanges.filter(
    (change) => change.tenantNotifiedAt === null,
  );
  for (const change of data.rentChanges) {
    const sessionDone =
      change.tenantNotifiedAt !== null && notifiedSteps.has(change.stepId);
    if (change.tenantNotifiedAt !== null && !sessionDone) continue;
    const kind =
      change.previousAmountCents === null
        ? "change"
        : change.amountCents > change.previousAmountCents
          ? "increase"
          : "decrease";
    const title = (
      <>
        Tell <AccountLink accountId={change.accountId} tenant={change.tenant} />{" "}
        about the {shortDate(change.startsOn, today)} rent {kind}
      </>
    );
    const action = (
      <NotifyAction
        accountId={change.accountId}
        accountVersion={change.accountVersion}
        leaseId={change.leaseId}
        stepId={change.stepId}
        notified={change.tenantNotifiedAt !== null}
        onChanged={(notified) =>
          setNotifiedSteps((steps) => {
            const next = new Set(steps);
            if (notified) next.add(change.stepId);
            else next.delete(change.stepId);
            return next;
          })
        }
      />
    );
    if (sessionDone && change.tenantNotifiedAt) {
      done.push({
        key: `rent-${change.stepId}`,
        tone: "done",
        icon: Check,
        title,
        meta: `Marked notified ${notifiedFormat.format(change.tenantNotifiedAt)}.`,
        actions: action,
      });
    } else {
      const from =
        change.previousAmountCents === null
          ? `Base rent becomes ${formatMoney(change.amountCents)}`
          : `Base rent ${formatMoney(change.previousAmountCents)} → ${formatMoney(change.amountCents)}`;
      soon.push({
        key: `rent-${change.stepId}`,
        tone: "amber",
        icon: TrendingUp,
        title,
        meta: `${from} for unit ${change.unit.label}. ${daysAway(today, change.startsOn)}`,
        actions: action,
      });
    }
  }

  for (const item of data.leasesEnding) {
    soon.push({
      key: `ending-${item.accountId}`,
      tone: "plain",
      icon: CalendarClock,
      title: (
        <>
          <AccountLink
            accountId={item.accountId}
            tenant={item.tenant}
            unit={item.unit}
          />{" "}
          lease ends {shortDate(item.endDate, today)}
        </>
      ),
      meta: daysAway(today, item.endDate),
      actions: (
        <LinkButton href={leaseHref(item.accountId)}>Add renewal</LinkButton>
      ),
    });
  }

  for (const fee of decidedFees) {
    const name = (
      <AccountLink
        accountId={fee.accountId}
        tenant={fee.tenant}
        unit={fee.unit}
      />
    );
    done.push(
      fee.outcome.kind === "approved"
        ? {
            key: `fee-${fee.key}`,
            tone: "done",
            icon: Check,
            title: <>Late fee approved for {name}</>,
            meta: `${formatMoney(fee.amountCents)} added, dated ${shortDate(fee.outcome.entryDate, today)}.`,
          }
        : {
            key: `fee-${fee.key}`,
            tone: "done",
            icon: Check,
            title: <>Late fee dismissed for {name}</>,
            meta: `No fee added for ${monthName(fee.month)}.`,
          },
    );
  }

  const checked: string[] = [];
  if (hasAccounts) {
    if (tracking && pendingFees.length === 0) {
      checked.push("no late fees to decide");
    }
    if (!data.insurance.some((item) => item.problem === "expiring")) {
      checked.push("no certificates expire in the next 60 days");
    }
    if (pendingRentChanges.length === 0) {
      checked.push("no rent changes to announce");
    }
    if (data.leasesEnding.length === 0 && data.pastEndDate.length === 0) {
      checked.push("no leases end in the next 90 days");
    }
  }
  if (toSort.length === 0) checked.push("every transaction is sorted");

  const showSide = tracking && hasAccounts;

  return (
    <>
      <PageTopBar
        crumbs={[{ label: "Home" }]}
        actions={
          <>
            <Button variant="outline" className="max-nav:hidden" asChild>
              <Link href="/transactions?add=cash">
                <Banknote />
                Add cash expense
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/transactions/import">
                <Upload />
                Import bank file
              </Link>
            </Button>
          </>
        }
      />
      <div className="nav:px-6 nav:pt-[22px] nav:pb-12 max-w-[1180px] px-4 pt-[18px] pb-10">
        <div className="animate-rise mb-[22px]" style={rise(0)}>
          <div className="label-caps mb-1">{propertyName}</div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
            {dayHeading(today)}
          </h1>
        </div>
        <div
          className={
            showSide
              ? "grid grid-cols-[minmax(0,1fr)] items-start gap-[22px] min-[980px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]"
              : "max-w-[760px]"
          }
        >
          <div>
            <TodoGroup title="Needs action" items={now} startIndex={1} />
            <TodoGroup
              title="Coming up"
              items={soon}
              startIndex={1 + now.length}
            />
            <TodoGroup
              title="Done"
              items={done}
              startIndex={1 + now.length + soon.length}
            />
            <AlsoChecked
              parts={checked}
              allClear={now.length + soon.length === 0}
              index={1 + now.length + soon.length + done.length}
            />
          </div>
          {showSide ? (
            <div className="flex flex-col gap-4">
              <RentChartCard months={data.rentMonths} today={today} index={2} />
              <BalancesCard rows={status.rows} index={3} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
