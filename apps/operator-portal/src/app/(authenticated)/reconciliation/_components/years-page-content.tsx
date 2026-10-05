"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";

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

import { useTRPC } from "~/trpc/react";
import {
  timestampFormat,
  YEAR_STATUS_LABELS,
  YEAR_STATUS_VARIANTS,
  yearsUnavailableMessage,
} from "../_lib/reconciliation";
import { formatDate } from "../../leases/_lib/format";

export function YearsPageContent() {
  const trpc = useTRPC();
  const router = useRouter();
  const { data } = useSuspenseQuery(
    trpc.reconciliation.listYears.queryOptions(),
  );
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const finalizedFormat = timestampFormat(property.timeZone);
  const unavailable = yearsUnavailableMessage(data);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reconciliation"
        description="Each year's shared costs, the statement for each tenant, and the letters."
      />
      {unavailable ? (
        <EmptyState
          icon={<Calculator className="size-5" />}
          headline="No year to reconcile yet"
          description={unavailable}
          action={
            data.trackingStart === null ? (
              <Button type="button" asChild>
                <Link href="/setup">Go to Setup</Link>
              </Button>
            ) : null
          }
          className="rounded-lg border border-dashed py-16"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Letter date</TableHead>
              <TableHead>Finalized</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.years.map((row) => {
              const href = `/reconciliation/${row.year}`;
              return (
                <TableRow
                  key={row.year}
                  className="cursor-pointer"
                  onClick={() => router.push(href)}
                >
                  <TableCell className="font-medium">
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.year}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={YEAR_STATUS_VARIANTS[row.status]}>
                      {YEAR_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.letterDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.finalizedAt
                      ? finalizedFormat.format(row.finalizedAt)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link href={href} onClick={(e) => e.stopPropagation()}>
                        Open
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
