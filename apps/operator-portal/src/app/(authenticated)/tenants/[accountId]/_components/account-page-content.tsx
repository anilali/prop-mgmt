"use client";

import type { CSSProperties } from "react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { Chip } from "@moonship/ui/chip";
import { formatMoney, Money } from "@moonship/ui/money";
import { MONTH_CELL_TEXT, MonthStrip } from "@moonship/ui/month-strip";
import { StatusPill } from "@moonship/ui/status-pill";
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@moonship/ui/tabs";

import type { Lease } from "../../_lib/lease-form";
import type { EntryRow } from "../../../_lib/rent";
import type { AdjustmentTarget } from "./adjustment-dialog";
import type { LeaseAction } from "./lease-action-dialog";
import type { LeaseDialogTarget } from "./lease-dialog";
import { useTRPC } from "~/trpc/react";
import {
  MailingAddressDialog,
  TenantDialog,
} from "../../_components/tenant-dialog";
import { leaseToForm, newestLease } from "../../_lib/lease-form";
import {
  currentLease,
  formatAddressLines,
  rentDate,
  rentLines,
} from "../../_lib/lease-terms";
import { PageTopBar } from "../../../_components/page-top-bar";
import { formatDate } from "../../../_lib/format";
import { RENT_STATUS_LABELS, RENT_STATUS_PILLS } from "../../../_lib/rent";
import { AccountSide } from "./account-side";
import { ActivityTab } from "./activity-tab";
import { AdjustmentDialog } from "./adjustment-dialog";
import { Banner, LateFeeBanner } from "./banners";
import { DocumentsTab } from "./documents-tab";
import { LeaseActionDialog } from "./lease-action-dialog";
import { LeaseDialog } from "./lease-dialog";
import { LeaseTab } from "./lease-tab";
import { OpeningBalanceDialog } from "./opening-balance-dialog";

const TABS = ["activity", "lease", "documents"] as const;
type Tab = (typeof TABS)[number];

const MONTHS = [
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
];

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab === value);
}

function rise(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

function DocumentCount({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.document.list.queryOptions({ accountId }),
  );
  return <TabsCount>{data.documents.length}</TabsCount>;
}

export function AccountPageContent({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const { data: history } = useSuspenseQuery(
    trpc.rent.history.queryOptions({ accountId }),
  );
  const { data: detail } = useSuspenseQuery(
    trpc.account.get.queryOptions({ id: accountId }),
  );
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: tenants } = useSuspenseQuery(trpc.tenant.list.queryOptions());
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const { data: pools } = useSuspenseQuery(trpc.pool.list.queryOptions());
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );

  const [adjustment, setAdjustment] = useState<AdjustmentTarget | null>(null);
  const [leaseAction, setLeaseAction] = useState<LeaseAction | null>(null);
  const [leaseTarget, setLeaseTarget] = useState<LeaseDialogTarget | null>(
    null,
  );
  const [editingOpening, setEditingOpening] = useState(false);
  const [editingTenant, setEditingTenant] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);

  const { account, unitPools } = detail;
  const today = history.today;
  const year = today.slice(0, 4);
  const currentMonth = Number(today.slice(5, 7));
  const tab: Tab = (() => {
    const value = searchParams.get("tab");
    return isTab(value) ? value : "activity";
  })();
  const setTab = (value: string) => {
    if (!isTab(value)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const tenant = tenants.find((t) => t.id === account.tenant.id);
  const unitView = units.find((u) => u.id === account.unit.id);
  const unitPoolNames = pools
    .filter((pool) => pool.units.some((u) => u.unitId === account.unit.id))
    .map((pool) => pool.name);
  const shares = new Map(
    pools.flatMap((pool) => {
      const row = pool.units.find((u) => u.unitId === account.unit.id);
      return row ? [[pool.id, row.shareBps] as const] : [];
    }),
  );
  const lease = currentLease(account.leases, today);
  const newest = newestLease(account.leases);
  const poolName = (poolId: string) =>
    unitPools.find((pool) => pool.id === poolId)?.name ??
    pools.find((pool) => pool.id === poolId)?.name ??
    "Other pool";
  const lines = lease ? rentLines(lease, rentDate(lease, today), poolName) : [];
  const otherAccounts = accountList.accounts.filter(
    (other) => other.tenant.id === account.tenant.id && other.id !== account.id,
  );
  const received = history.months.reduce(
    (sum, cell) => sum + cell.paidCents,
    0,
  );
  const tracking = history.trackingStart !== null;
  const holdover = account.state === "holdover" && newest?.moveOutDate === null;

  const openLeaseEdit = (target: Lease) =>
    setLeaseTarget({
      mode: "edit",
      lease: target,
      initial: leaseToForm(target, unitPools),
      isNewest: target.id === newest?.id,
    });

  const openingDescription = property.trackingStartDate
    ? `What the tenant owed at the end of the day before ${formatDate(property.trackingStartDate)}, including last year's true-up. Enter a prepayment as a negative amount. Only an account that starts on or before that date can have one; use an adjustment otherwise.`
    : "Set the tracking start date in Setup before entering an opening balance.";

  return (
    <div className="flex min-h-full flex-col">
      <PageTopBar
        crumbs={[
          { label: "Tenants", href: "/tenants" },
          { label: `${account.tenant.businessName} · ${account.unit.label}` },
        ]}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={!tracking}
            title={
              tracking
                ? undefined
                : "Set the tracking start date in Setup first"
            }
            onClick={() => setAdjustment({ mode: "add" })}
          >
            <Plus />
            Add adjustment
          </Button>
        }
      />
      <div className="grid flex-1 min-[980px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="nav:px-6 nav:pt-[22px] nav:pb-12 min-w-0 px-4 pt-[18px] pb-10">
          <div className="animate-rise flex flex-wrap items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-[-0.015em]">
              {account.tenant.businessName}
            </h1>
            <Chip>Unit {account.unit.label}</Chip>
            <StatusPill variant={RENT_STATUS_PILLS[history.status]}>
              {RENT_STATUS_LABELS[history.status]}
            </StatusPill>
            {account.state === "closed" ? (
              <StatusPill variant="plain">Moved out</StatusPill>
            ) : null}
            {account.state === "upcoming" ? (
              <StatusPill variant="plain">
                Starts {formatDate(account.startDate)}
              </StatusPill>
            ) : null}
          </div>

          <div
            className="border-line animate-rise my-[18px] grid grid-cols-3 overflow-hidden rounded-[9px] border max-[560px]:grid-cols-1"
            style={rise(1)}
          >
            {[
              {
                label: "Past due",
                cents: history.pastDueCents,
                tone: history.pastDueCents > 0 ? "red" : "default",
              } as const,
              {
                label: "Balance",
                cents: history.balanceCents,
                tone: "default",
              } as const,
              {
                label: `Received in ${year}`,
                cents: received,
                tone: "default",
              } as const,
            ].map((figure) => (
              <div
                key={figure.label}
                className="border-line min-w-0 px-3.5 py-3 [&+&]:border-l max-[560px]:[&+&]:border-t max-[560px]:[&+&]:border-l-0"
              >
                <div className="label-caps mb-1">{figure.label}</div>
                <Money
                  cents={figure.cents}
                  tone={figure.tone}
                  className="text-[18px] font-medium tracking-[-0.03em]"
                />
              </div>
            ))}
          </div>

          {history.suggestions.map((suggestion) => (
            <LateFeeBanner key={suggestion.month} suggestion={suggestion} />
          ))}
          {holdover ? (
            <Banner
              tone="amber"
              actions={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLeaseAction({ kind: "moveout" })}
                  >
                    Set move-out
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setLeaseAction({ kind: "renew" })}
                  >
                    Add renewal
                  </Button>
                </>
              }
            >
              <b className="font-semibold">
                Lease ended {formatDate(newest.endDate)}.
              </b>{" "}
              Rent is still expected on the old terms until you add a renewal or
              a move-out date.
            </Banner>
          ) : null}

          <div className="animate-rise" style={rise(3)}>
            <MonthStrip
              size="bar"
              cells={history.months.map((cell) => {
                const name = MONTHS[cell.month - 1] ?? "";
                const counted = cell.state !== "off" && cell.state !== "future";
                return {
                  state: cell.state,
                  current: cell.month === currentMonth,
                  title: `${name}: ${MONTH_CELL_TEXT[cell.state]}${counted ? `. Paid ${formatMoney(cell.paidCents)} of ${formatMoney(cell.expectedCents)}` : ""}`,
                };
              })}
            />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="mt-5 gap-3.5">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="lease">Lease</TabsTrigger>
              <TabsTrigger value="documents">
                Documents
                <Suspense fallback={null}>
                  <DocumentCount accountId={accountId} />
                </Suspense>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="activity">
              <ActivityTab
                data={history}
                onEditAdjustment={(row: EntryRow) =>
                  setAdjustment({ mode: "edit", row })
                }
              />
            </TabsContent>
            <TabsContent value="lease">
              <LeaseTab
                account={account}
                pools={unitPools}
                shares={shares}
                today={today}
                timeZone={property.timeZone}
                onAction={setLeaseAction}
                onEditLease={openLeaseEdit}
              />
            </TabsContent>
            <TabsContent value="documents">
              <Suspense
                fallback={
                  <p className="text-fg-3 text-[12.5px]">Loading documents</p>
                }
              >
                <DocumentsTab
                  accountId={accountId}
                  leases={account.leases}
                  timeZone={property.timeZone}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>

        <AccountSide
          account={account}
          tenant={tenant}
          unit={
            unitView
              ? {
                  label: unitView.label,
                  sqft: unitView.sqft,
                  addressLines: formatAddressLines(unitView.address),
                  poolNames: unitPoolNames,
                }
              : undefined
          }
          lease={lease}
          rentLines={lines}
          otherAccounts={otherAccounts}
          today={today}
          onEditTenant={() => setEditingTenant(true)}
          onEditAddress={() => setEditingAddress(true)}
          onEditInsurance={() => setLeaseAction({ kind: "insurance" })}
          onEditOpening={() => setEditingOpening(true)}
        />
      </div>

      <AdjustmentDialog
        accountId={accountId}
        accountName={`${account.tenant.businessName} · ${account.unit.label}`}
        today={today}
        trackingStart={history.trackingStart}
        target={adjustment}
        onClose={() => setAdjustment(null)}
      />
      <LeaseActionDialog
        action={leaseAction}
        account={account}
        pools={unitPools}
        today={today}
        onClose={() => setLeaseAction(null)}
      />
      <LeaseDialog
        accountId={accountId}
        version={account.version}
        target={leaseTarget}
        pools={unitPools}
        onClose={() => setLeaseTarget(null)}
      />
      <OpeningBalanceDialog
        accountId={accountId}
        version={account.version}
        openingBalanceCents={account.openingBalanceCents}
        description={openingDescription}
        open={editingOpening}
        onOpenChange={setEditingOpening}
      />
      <TenantDialog
        tenant={editingTenant && tenant ? tenant : null}
        onClose={() => setEditingTenant(false)}
      />
      <MailingAddressDialog
        tenant={editingAddress && tenant ? tenant : null}
        onClose={() => setEditingAddress(false)}
      />
    </div>
  );
}
