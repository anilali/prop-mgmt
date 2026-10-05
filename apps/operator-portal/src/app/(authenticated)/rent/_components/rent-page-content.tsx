"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";

import { formatCents } from "@moonship/shared";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import { PageHeader } from "@moonship/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { RentStatusData } from "../_lib/rent";
import { useTRPC } from "~/trpc/react";
import { RENT_STATUS_LABELS, RENT_STATUS_VARIANTS } from "../_lib/rent";
import { ACCOUNT_STATE_LABELS, formatDate } from "../../leases/_lib/format";

export function RentPageContent() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.rent.status.queryOptions());

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rent"
        description="What each tenant was expected to pay so far, what they paid, and what they owe."
      />
      <Freshness today={data.today} newestBankDate={data.newestBankDate} />
      <RentTable data={data} />
    </div>
  );
}

export function Freshness({
  today,
  newestBankDate,
}: {
  today: string;
  newestBankDate: string | null;
}) {
  return (
    <p className="text-muted-foreground text-sm">
      As of {formatDate(today)}.{" "}
      {newestBankDate ? (
        <>Bank activity imported through {formatDate(newestBankDate)}.</>
      ) : (
        <>No bank activity imported yet.</>
      )}{" "}
      <Link
        className="underline underline-offset-4"
        href="/transactions/import"
      >
        Import CSV
      </Link>
    </p>
  );
}

function RentTable({ data }: { data: RentStatusData }) {
  const router = useRouter();

  if (data.trackingStart === null) {
    return (
      <EmptyState
        icon={<Wallet className="size-5" />}
        headline="No tracking start date"
        description="Set the tracking start date in Setup. Balances count from that day."
        action={
          <Button type="button" asChild>
            <Link href="/setup">Go to Setup</Link>
          </Button>
        }
        className="rounded-lg border border-dashed py-16"
      />
    );
  }

  if (data.rows.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="size-5" />}
        headline="No accounts to show"
        description="This lists accounts open today and closed accounts that still have a balance."
        action={
          <Button type="button" asChild>
            <Link href="/leases">Go to Leases</Link>
          </Button>
        }
        className="rounded-lg border border-dashed py-16"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tenant</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Expected so far</TableHead>
          <TableHead className="text-right">Received so far</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Last payment</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((row) => {
          const href = `/rent/${row.accountId}`;
          return (
            <TableRow
              key={row.accountId}
              className="cursor-pointer"
              onClick={() => router.push(href)}
            >
              <TableCell className="font-medium">
                <Link
                  className="underline-offset-4 hover:underline"
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.tenant.businessName}
                </Link>
                {row.state === "open" ? null : (
                  <Badge variant="outline" className="ml-2">
                    {ACCOUNT_STATE_LABELS[row.state]}
                  </Badge>
                )}
              </TableCell>
              <TableCell>{row.unit.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(row.expectedCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(row.receivedCents)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCents(row.balanceCents)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(row.lastPaymentOn)}
              </TableCell>
              <TableCell>
                <Badge variant={RENT_STATUS_VARIANTS[row.status]}>
                  {RENT_STATUS_LABELS[row.status]}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
