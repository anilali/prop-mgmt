"use client";

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Split } from "lucide-react";

import { Input } from "@moonship/ui/input";
import { Segmented } from "@moonship/ui/segmented";
import { StatusPill } from "@moonship/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { DraftLine } from "../_lib/draft";
import type { ListRow } from "../_lib/transactions";
import type { SortTxn } from "./sort-dialog";
import { useTRPC } from "~/trpc/react";
import { draftLinesFrom, newDraftLine } from "../_lib/draft";
import { choiceIds, linesName, suggestedTarget } from "../_lib/transactions";
import { formatMonthDay } from "../../_lib/format";
import { Amount } from "./amount";
import { CashExpenseDialog } from "./cash-expense-dialog";
import { SortDialog } from "./sort-dialog";

type Direction = "all" | "in" | "out";

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
];

export function AllTab({ rows }: { rows: readonly ListRow[] }) {
  const trpc = useTRPC();
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );
  const { data: categories } = useSuspenseQuery(
    trpc.category.list.queryOptions({ includeArchived: true }),
  );
  const { data: toSort } = useSuspenseQuery(
    trpc.transaction.listToSort.queryOptions(),
  );
  const [direction, setDirection] = useState<Direction>("all");
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<{
    txn: SortTxn;
    lines: DraftLine[];
    sorted: boolean;
    firstAccountIds: string[];
  } | null>(null);
  const [cashRow, setCashRow] = useState<ListRow | null>(null);
  const accounts = accountList.accounts;
  const thisYear = accountList.today.slice(0, 4);

  const q = query.trim().toLowerCase();
  const visible = rows
    .filter(
      (row) =>
        direction === "all" ||
        (direction === "in" ? row.amountCents > 0 : row.amountCents < 0),
    )
    .map((row) => ({
      row,
      target: linesName(row.lines, accounts, categories),
    }))
    .filter(
      ({ row, target }) =>
        q === "" || `${row.description} ${target}`.toLowerCase().includes(q),
    );

  const open = (row: ListRow) => {
    if (row.source === "cash") {
      setCashRow(row);
      return;
    }
    if (row.lines.length > 0) {
      setSorting({
        txn: row,
        lines: draftLinesFrom(row.amountCents, row.lines),
        sorted: true,
        firstAccountIds: [],
      });
      return;
    }
    const pending = toSort.find((other) => other.id === row.id);
    const target = pending ? suggestedTarget(pending.suggestion) : "";
    setSorting({
      txn: row,
      lines: [newDraftLine(target, Math.abs(row.amountCents))],
      sorted: false,
      firstAccountIds: pending ? choiceIds(pending.suggestion) : [],
    });
  };

  return (
    <div className="nav:px-6 nav:pt-[22px] nav:pb-12 px-4 pt-[18px] pb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          aria-label="Direction"
          value={direction}
          onValueChange={setDirection}
          options={DIRECTIONS}
        />
        <Input
          className="max-sm:w-full sm:w-[220px]"
          placeholder="Filter by description or target"
          aria-label="Filter transactions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {visible.length === 0 ? (
        <p className="border-line-2 text-fg-2 rounded-[10px] border border-dashed py-12 text-center text-[12.5px]">
          {rows.length === 0
            ? "No transactions yet. Import a bank file to start."
            : "No transactions match."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Sorted to</TableHead>
              <TableHead className="max-sm:hidden">Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ row, target }) => (
              <TableRow key={row.id} onClick={() => open(row)}>
                <TableCell className="text-fg-3 font-mono">
                  {formatMonthDay(row.postedOn)}
                  {row.postedOn.slice(0, 4) !== thisYear ? (
                    <span>, {row.postedOn.slice(0, 4)}</span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-[320px] truncate">
                  {row.description}
                </TableCell>
                <TableCell className="max-w-[280px] truncate">
                  {row.lines.length === 0 ? (
                    <StatusPill variant="accent">To sort</StatusPill>
                  ) : row.lines.length > 1 ? (
                    <StatusPill variant="plain">
                      <Split className="size-3" />
                      {target}
                    </StatusPill>
                  ) : (
                    target
                  )}
                </TableCell>
                <TableCell className="text-fg-3 max-sm:hidden">
                  {row.source === "cash" ? "Cash" : "Bank"}
                </TableCell>
                <TableCell className="text-right">
                  <Amount cents={row.amountCents} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SortDialog
        txn={sorting?.txn ?? null}
        initialLines={sorting?.lines ?? []}
        sorted={sorting?.sorted ?? false}
        firstAccountIds={sorting?.firstAccountIds ?? []}
        accounts={accounts}
        categories={categories}
        open={sorting !== null}
        onOpenChange={(next) => {
          if (!next) setSorting(null);
        }}
      />
      <CashExpenseDialog
        expense={cashRow}
        open={cashRow !== null}
        onOpenChange={(next) => {
          if (!next) setCashRow(null);
        }}
      />
    </div>
  );
}
