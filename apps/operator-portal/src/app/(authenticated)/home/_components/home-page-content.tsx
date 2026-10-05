"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  useIsMutating,
  useMutation,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { RouterOutputs } from "@moonship/api-operator";
import { formatCents } from "@moonship/shared";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { PageHeader } from "@moonship/ui/page-header";
import { Switch } from "@moonship/ui/switch";

import { useTRPC } from "~/trpc/react";
import {
  ACCOUNT_STATE_LABELS,
  formatDate,
  notifiedDateFormat,
} from "../../leases/_lib/format";
import {
  useAccountUpdated,
  useAccountUpdateFailed,
} from "../../leases/[accountId]/_components/use-account-updated";
import { LateFeeSuggestionList } from "../../rent/_components/late-fee-suggestion";
import { RENT_STATUS_LABELS, RENT_STATUS_VARIANTS } from "../../rent/_lib/rent";

type ComingUp = RouterOutputs["home"]["comingUp"];
type BehindRow = ComingUp["behind"][number];
type RentChange = ComingUp["rentChanges"][number];
type InsuranceItem = ComingUp["insurance"][number];
type LeaseEndItem = ComingUp["leasesEnding"][number];

export function HomePageContent() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.home.comingUp.queryOptions());

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title="Home"
        description={`What needs attention, as of ${formatDate(data.today)}.`}
      />
      <BehindCard data={data} />
      <LateFeesCard items={data.lateFees} />
      <ToSortCard count={data.toSortCount} />
      <RentChangesCard items={data.rentChanges} timeZone={data.timeZone} />
      <InsuranceCard items={data.insurance} />
      <LeasesEndingCard
        ending={data.leasesEnding}
        pastEndDate={data.pastEndDate}
      />
    </div>
  );
}

function HomeCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="font-semibold">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

function AccountName({
  href,
  tenant,
  unit,
  badge,
}: {
  href: string;
  tenant: { businessName: string };
  unit: { label: string };
  badge?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Link
        className="font-medium underline-offset-4 hover:underline"
        href={href}
      >
        {tenant.businessName}
      </Link>
      {badge}
      <p className="text-muted-foreground text-xs">Unit {unit.label}</p>
    </div>
  );
}

function BehindCard({ data }: { data: ComingUp }) {
  return (
    <HomeCard
      title="Behind"
      action={
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href="/rent">Rent</Link>
        </Button>
      }
    >
      {data.trackingStart === null ? (
        <Empty>
          Set the tracking start date in{" "}
          <Link className="underline underline-offset-4" href="/setup">
            Setup
          </Link>{" "}
          to see balances.
        </Empty>
      ) : data.behind.length === 0 ? (
        <Empty>No one is behind.</Empty>
      ) : (
        <ul className="divide-y">
          {data.behind.map((row) => (
            <BehindItem key={row.accountId} row={row} />
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

function BehindItem({ row }: { row: BehindRow }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <AccountName
        href={`/rent/${row.accountId}`}
        tenant={row.tenant}
        unit={row.unit}
        badge={
          <>
            <Badge variant={RENT_STATUS_VARIANTS[row.status]} className="ml-2">
              {RENT_STATUS_LABELS[row.status]}
            </Badge>
            {row.state === "open" ? null : (
              <Badge variant="outline" className="ml-2">
                {ACCOUNT_STATE_LABELS[row.state]}
              </Badge>
            )}
          </>
        }
      />
      <div className="text-right">
        <p className="font-medium tabular-nums">
          {formatCents(row.balanceCents)}
        </p>
        <p className="text-muted-foreground text-xs">
          Last payment {formatDate(row.lastPaymentOn)}
        </p>
      </div>
    </li>
  );
}

function LateFeesCard({ items }: { items: ComingUp["lateFees"] }) {
  return (
    <HomeCard
      title="Late fees to decide"
      description="This month's rent was not paid in full by the late fee date. Tenants who have caught up since are listed too."
    >
      {items.length === 0 ? (
        <Empty>No late fees to decide.</Empty>
      ) : (
        <LateFeeSuggestionList items={items} />
      )}
    </HomeCard>
  );
}

function ToSortCard({ count }: { count: number }) {
  return (
    <HomeCard title="To sort">
      {count === 0 ? (
        <Empty>No transactions to sort.</Empty>
      ) : (
        <p className="text-sm">
          <Link
            className="font-medium underline underline-offset-4"
            href="/transactions"
          >
            {count} {count === 1 ? "transaction" : "transactions"} to sort
          </Link>
        </p>
      )}
    </HomeCard>
  );
}

function RentChangesCard({
  items,
  timeZone,
}: {
  items: RentChange[];
  timeZone: string;
}) {
  const notifiedFormat = notifiedDateFormat(timeZone);
  return (
    <HomeCard
      title="Rent changes"
      description="Base rent changes in the next 90 days."
    >
      {items.length === 0 ? (
        <Empty>No rent changes coming up.</Empty>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <RentChangeItem
              key={item.stepId}
              item={item}
              notifiedFormat={notifiedFormat}
            />
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

function RentChangeItem({
  item,
  notifiedFormat,
}: {
  item: RentChange;
  notifiedFormat: Intl.DateTimeFormat;
}) {
  const trpc = useTRPC();
  const accountUpdated = useAccountUpdated(item.accountId);
  const accountUpdateFailed = useAccountUpdateFailed(item.accountId);
  const setNotified = useMutation(
    trpc.lease.setRentStepNotified.mutationOptions({
      onSuccess: async (detail) => {
        await accountUpdated(detail);
      },
      onError: accountUpdateFailed,
    }),
  );
  const accountPending =
    useIsMutating({
      mutationKey: trpc.lease.setRentStepNotified.mutationKey(),
      predicate: (mutation) =>
        (mutation.state.variables as { accountId?: string } | undefined)
          ?.accountId === item.accountId,
    }) > 0;
  const switchId = `notified-${item.stepId}`;

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <AccountName
        href={`/leases/${item.accountId}`}
        tenant={item.tenant}
        unit={item.unit}
      />
      <div className="text-sm sm:text-right">
        <p className="tabular-nums">
          {item.previousAmountCents === null
            ? formatCents(item.amountCents)
            : `${formatCents(item.previousAmountCents)} → ${formatCents(item.amountCents)}`}
        </p>
        <p className="text-muted-foreground text-xs">
          Starts {formatDate(item.startsOn)}
        </p>
      </div>
      <label
        htmlFor={switchId}
        className="flex items-center gap-2 text-sm sm:w-48 sm:justify-end"
      >
        <Switch
          id={switchId}
          checked={item.tenantNotifiedAt !== null}
          disabled={accountPending}
          onCheckedChange={(checked) =>
            setNotified.mutate({
              accountId: item.accountId,
              expectedVersion: item.accountVersion,
              leaseId: item.leaseId,
              stepId: item.stepId,
              notified: checked,
            })
          }
        />
        {item.tenantNotifiedAt
          ? `Notified ${notifiedFormat.format(item.tenantNotifiedAt)}`
          : "Tenant notified"}
      </label>
    </li>
  );
}

const INSURANCE_TEXT: Record<
  InsuranceItem["problem"],
  (date: string) => string
> = {
  missing: () => "No certificate on file",
  expired: (date) => `Expired ${date}`,
  expiring: (date) => `Expires ${date}`,
};

function InsuranceCard({ items }: { items: InsuranceItem[] }) {
  return (
    <HomeCard
      title="Insurance"
      description="Certificates that are missing, expired, or expire in the next 60 days."
    >
      {items.length === 0 ? (
        <Empty>All certificates are on file and current.</Empty>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li
              key={item.leaseId}
              className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <AccountName
                href={`/leases/${item.accountId}`}
                tenant={item.tenant}
                unit={item.unit}
              />
              <p
                className={
                  item.problem === "expiring"
                    ? "text-sm"
                    : "text-destructive text-sm"
                }
              >
                {INSURANCE_TEXT[item.problem](
                  formatDate(item.insuranceExpiresOn),
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

function LeaseEndList({
  items,
  verb,
}: {
  items: LeaseEndItem[];
  verb: string;
}) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li
          key={item.accountId}
          className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <AccountName
            href={`/leases/${item.accountId}`}
            tenant={item.tenant}
            unit={item.unit}
          />
          <p className="text-sm">
            {verb} {formatDate(item.endDate)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function LeasesEndingCard({
  ending,
  pastEndDate,
}: {
  ending: LeaseEndItem[];
  pastEndDate: LeaseEndItem[];
}) {
  return (
    <HomeCard title="Leases ending">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">In the next 90 days</h3>
        {ending.length === 0 ? (
          <Empty>No leases are ending.</Empty>
        ) : (
          <LeaseEndList items={ending} verb="Ends" />
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Past end date</h3>
        <p className="text-muted-foreground text-xs">
          The lease has ended with no renewal or move-out date.
        </p>
        {pastEndDate.length === 0 ? (
          <Empty>No accounts are past their lease end date.</Empty>
        ) : (
          <LeaseEndList items={pastEndDate} verb="Ended" />
        )}
      </div>
    </HomeCard>
  );
}
