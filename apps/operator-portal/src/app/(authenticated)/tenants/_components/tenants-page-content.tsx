"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import type { IsoDate } from "@moonship/shared";
import type { MonthCellState } from "@moonship/ui/month-strip";
import { Button } from "@moonship/ui/button";
import { Chip } from "@moonship/ui/chip";
import { EmptyState } from "@moonship/ui/empty-state";
import { List, ListHeader, ListRow } from "@moonship/ui/list";
import { Money } from "@moonship/ui/money";
import { MonthStrip } from "@moonship/ui/month-strip";
import { StatusPill } from "@moonship/ui/status-pill";

import type { TenantRow } from "../_lib/tenant-rows";
import type { TenantView } from "./tenant-dialog";
import { useTRPC } from "~/trpc/react";
import { accountsNeedingHistory, tenantRows } from "../_lib/tenant-rows";
import { PageTopBar } from "../../_components/page-top-bar";
import { formatDate, formatMonthDay } from "../../_lib/format";
import { NewTenantDialog } from "./new-tenant-dialog";
import { TenantDialog } from "./tenant-dialog";

const COLUMNS =
  "grid-cols-[minmax(0,1fr)_128px_112px_150px_124px] max-[980px]:grid-cols-[minmax(0,1fr)_104px_140px_124px] max-[560px]:grid-cols-[minmax(0,1fr)_96px]";

const KEY: { state: MonthCellState; label: string }[] = [
  { state: "paid", label: "Paid" },
  { state: "short", label: "Short" },
  { state: "pending", label: "Waiting to sort" },
  { state: "nodata", label: "No bank data" },
];

function rise(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

function sameYearDate(date: IsoDate, today: IsoDate): string {
  return date.slice(0, 4) === today.slice(0, 4)
    ? formatMonthDay(date)
    : formatDate(date);
}

function LeaseCell({ row, today }: { row: TenantRow; today: IsoDate }) {
  if (row.state === "holdover" && row.newest) {
    return (
      <span className="text-red">
        Ended {sameYearDate(row.newest.endDate, today)}
      </span>
    );
  }
  if (row.state === "closed" && row.endDate) {
    return <>Moved out {formatDate(row.endDate)}</>;
  }
  if (row.state === "upcoming") {
    return <>Starts {formatDate(row.startDate)}</>;
  }
  if (row.newest?.moveOutDate) {
    return <>Moves out {formatDate(row.newest.moveOutDate)}</>;
  }
  return <>Ends {formatDate(row.newest?.endDate)}</>;
}

function BalanceCell({ row }: { row: TenantRow }) {
  if (row.balanceCents < 0) {
    return <Money cents={row.balanceCents} tone="blue" />;
  }
  return (
    <Money
      cents={row.balanceCents}
      tone={
        row.status === "behind"
          ? "red"
          : row.balanceCents === 0
            ? "faint"
            : "default"
      }
    />
  );
}

export function TenantsPageContent() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const { data: status } = useSuspenseQuery(trpc.rent.status.queryOptions());
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );
  const { data: tenants } = useSuspenseQuery(trpc.tenant.list.queryOptions());
  const histories = useSuspenseQueries({
    queries: accountsNeedingHistory(status, accountList).map((accountId) =>
      trpc.rent.history.queryOptions({ accountId }),
    ),
  });

  const [newOpen, setNewOpen] = useState(false);
  const [newTenantId, setNewTenantId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TenantView | null>(null);

  const rows = tenantRows(
    status,
    accountList,
    histories.map((history) => history.data),
  );
  const today = status.today;
  const year = today.slice(0, 4);
  const withAccounts = new Set(accountList.accounts.map((a) => a.tenant.id));
  const loose = tenants
    .filter((tenant) => !withAccounts.has(tenant.id))
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
  const dialogOpen = newOpen || searchParams.get("new") === "1";

  const openNew = (tenantId: string | null) => {
    setNewTenantId(tenantId);
    setNewOpen(true);
  };

  return (
    <>
      <PageTopBar
        crumbs={[{ label: "Tenants" }]}
        actions={
          <Button type="button" variant="outline" onClick={() => openNew(null)}>
            <Plus />
            New tenant
          </Button>
        }
      />
      <div className="nav:px-6 nav:pt-[22px] nav:pb-12 px-4 pt-[18px] pb-10">
        <div className="max-w-[880px]">
          {status.trackingStart === null ? (
            <p className="bg-sunk border-line text-fg-2 animate-rise mb-3.5 rounded-lg border px-3 py-2.5 text-[12.5px]">
              Set the tracking start date in{" "}
              <Link className="text-primary font-medium" href="/setup">
                Setup
              </Link>{" "}
              to start counting rent.
            </p>
          ) : null}
          {rows.length === 0 ? (
            <EmptyState headline="No tenants yet" className="animate-rise" />
          ) : (
            <>
              <div className="text-fg-2 animate-rise mb-2.5 flex flex-wrap justify-end gap-3.5 text-[11.5px]">
                {KEY.map((item) => (
                  <span
                    key={item.state}
                    className="inline-flex items-center gap-1.5"
                  >
                    <MonthStrip
                      aria-hidden
                      cells={[{ state: item.state, title: item.label }]}
                      className="[&>span]:h-2.5"
                    />
                    {item.label}
                  </span>
                ))}
              </div>
              <List>
                <ListHeader className={COLUMNS}>
                  <span>Account</span>
                  <span className="max-[980px]:hidden">Rent paid, {year}</span>
                  <span className="max-[560px]:hidden">Monthly</span>
                  <span>Balance</span>
                  <span className="max-[560px]:hidden">Lease</span>
                </ListHeader>
                {rows.map((row, index) => (
                  <ListRow
                    key={row.accountId}
                    asChild
                    className={`${COLUMNS} animate-rise`}
                    style={rise(index + 1)}
                  >
                    <Link href={`/tenants/${row.accountId}`}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Chip className="min-w-11 justify-center">
                          {row.unitLabel}
                        </Chip>
                        <span className="min-w-0 truncate font-medium">
                          {row.tenantName}
                        </span>
                      </span>
                      <span className="max-[980px]:hidden">
                        <MonthStrip
                          cells={row.months.map((cell) => ({
                            state: cell.state,
                          }))}
                        />
                      </span>
                      <span className="max-[560px]:hidden">
                        {row.monthlyCents > 0 ? (
                          <Money cents={row.monthlyCents} />
                        ) : null}
                      </span>
                      <span>
                        <BalanceCell row={row} />
                      </span>
                      <span className="text-fg-3 text-[11.5px] whitespace-nowrap max-[560px]:hidden">
                        <LeaseCell row={row} today={today} />
                      </span>
                    </Link>
                  </ListRow>
                ))}
              </List>
              <p className="text-fg-3 mt-3 text-[12px]">
                A tenant with two units has two accounts, each with its own
                statement and letter.
              </p>
            </>
          )}

          {loose.length > 0 ? (
            <LooseTenants
              tenants={loose}
              onEdit={setEditing}
              onAddLease={(tenant) => openNew(tenant.id)}
            />
          ) : null}
        </div>
      </div>

      <NewTenantDialog
        open={dialogOpen}
        initialTenantId={newTenantId}
        onOpenChange={(open) => {
          setNewOpen(open);
          if (!open && searchParams.get("new") !== null) {
            window.history.replaceState(null, "", "/tenants");
          }
        }}
      />
      <TenantDialog tenant={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function LooseTenants({
  tenants,
  onEdit,
  onAddLease,
}: {
  tenants: TenantView[];
  onEdit: (tenant: TenantView) => void;
  onAddLease: (tenant: TenantView) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const archive = useMutation(
    trpc.tenant.archive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.tenant.pathFilter());
        toast.success("Tenant archived");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <section className="mt-8">
      <h2 className="label-caps mb-2">Tenants without an account</h2>
      <List>
        {tenants.map((tenant) => (
          <ListRow
            key={tenant.id}
            className="grid-cols-[minmax(0,1fr)_auto] max-sm:grid-cols-1"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">
                  {tenant.businessName}
                </span>
                {tenant.status === "active" ? null : (
                  <StatusPill variant="plain">Archived</StatusPill>
                )}
              </span>
              <span className="text-fg-3 block truncate text-[11.5px]">
                {[tenant.contactName, tenant.email, tenant.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEdit(tenant)}
              >
                Edit
              </Button>
              {tenant.status === "active" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onAddLease(tenant)}
                  >
                    Add lease
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={archive.isPending}
                    onClick={() => archive.mutate({ id: tenant.id })}
                  >
                    Archive
                  </Button>
                </>
              ) : null}
            </span>
          </ListRow>
        ))}
      </List>
    </section>
  );
}
