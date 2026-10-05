"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { formatHundredthsOfCent, formatSqft } from "@moonship/billing";
import { formatCents } from "@moonship/shared";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { PoolView } from "../../_lib/reconciliation";
import { formatDate } from "../../../leases/_lib/format";
import { BillAmountDialog } from "./bill-amount-dialog";

export function PoolCards({
  year,
  pools,
  readOnly = false,
}: {
  year: number;
  pools: PoolView[];
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<PoolView | null>(null);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Pools</h2>
        <p className="text-muted-foreground text-sm">
          {readOnly ? (
            <>Each pool&apos;s {year} cost and the transactions behind it.</>
          ) : (
            <>
              Each pool&apos;s {year} cost comes from the transactions sorted to
              its category, unless you enter the bill amount.
            </>
          )}
        </p>
      </div>
      {pools.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          No pools yet. Add them in Setup.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {pools.map((pool) => (
            <PoolCard
              key={pool.poolId}
              pool={pool}
              onEditBill={readOnly ? null : () => setEditing(pool)}
            />
          ))}
        </div>
      )}
      {readOnly ? null : (
        <BillAmountDialog
          year={year}
          pool={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function PoolCard({
  pool,
  onEditBill,
}: {
  pool: PoolView;
  onEditBill: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const hasUnits = pool.poolSqft > 0;

  return (
    <div
      id={`pool-${pool.poolId}`}
      className="scroll-mt-6 space-y-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-medium">
            {pool.name}
            {pool.billOverride ? (
              <Badge variant="outline">Bill amount</Badge>
            ) : null}
            {pool.actualCents < 0 ? (
              <Badge variant="destructive">Negative</Badge>
            ) : null}
          </h3>
          <p className="text-muted-foreground text-sm">
            {hasUnits ? `${formatSqft(pool.poolSqft)} sq ft` : "No units"}
          </p>
        </div>
        {onEditBill ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEditBill}
          >
            {pool.billOverride ? "Edit bill amount" : "Enter bill amount"}
          </Button>
        ) : null}
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-muted-foreground">Actual cost</dt>
          <dd className="text-base font-medium tabular-nums">
            {formatCents(pool.actualCents)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Per sq ft per year</dt>
          <dd className="font-medium tabular-nums">
            {pool.costPerSqftYearCents === null
              ? "No units"
              : formatCents(pool.costPerSqftYearCents)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Per sq ft per month</dt>
          <dd className="font-medium tabular-nums">
            {pool.costPerSqftMonthHundredths === null
              ? "No units"
              : formatHundredthsOfCent(pool.costPerSqftMonthHundredths)}
          </dd>
        </div>
      </dl>

      {pool.billOverride ? (
        <div className="bg-muted/40 space-y-2 rounded-md border p-3 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-muted-foreground">Bill amount (used)</p>
              <p className="font-medium tabular-nums">
                {formatCents(pool.billOverride.amountCents)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Payments sorted here</p>
              <p className="font-medium tabular-nums">
                {formatCents(pool.categoryTotalCents)}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground whitespace-pre-wrap">
            Note: {pool.billOverride.note}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          {pool.lines.length}{" "}
          {pool.lines.length === 1 ? "transaction" : "transactions"},{" "}
          {formatCents(pool.categoryTotalCents)}
        </button>
        {open ? (
          pool.lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {onEditBill === null
                ? "No transactions."
                : pool.categoryId === null
                  ? "This pool has no category, so no transactions count toward it."
                  : "No transactions sorted to this pool's category in this year."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pool.lines.map((line, index) => (
                  <TableRow key={`${line.transactionId}-${index}`}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(line.postedOn)}
                    </TableCell>
                    <TableCell
                      className="max-w-72 truncate"
                      title={line.description}
                    >
                      {line.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {line.source === "cash" ? "Cash" : "Bank"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(-line.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : null}
      </div>
    </div>
  );
}
