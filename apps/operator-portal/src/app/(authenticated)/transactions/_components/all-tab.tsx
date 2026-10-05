"use client";

import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { formatCents } from "@moonship/shared";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { ListFilters, ListRow } from "../_lib/transactions";
import type { DraftLine, SortTxn } from "./sort-dialog";
import { useTRPC } from "~/trpc/react";
import {
  accountLabel,
  ALL,
  amountClass,
  CATEGORY_KIND_SHORT,
  EMPTY_FILTERS,
  formatAmount,
  lineName,
  toListInput,
} from "../_lib/transactions";
import { formatDate } from "../../leases/_lib/format";
import { CashExpenseDialog } from "./cash-expense-dialog";
import { draftLinesFrom, SortDialog } from "./sort-dialog";
import { useTransactionsChanged } from "./use-transactions-changed";

function yearsBetween(from: string | null, today: string): string[] {
  const last = Number(today.slice(0, 4));
  const first = from ? Number(from.slice(0, 4)) : last;
  const years: string[] = [];
  for (let year = last; year >= first; year -= 1) years.push(String(year));
  return years;
}

export function AllTab() {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );
  const { data: categories } = useSuspenseQuery(
    trpc.category.list.queryOptions({ includeArchived: true }),
  );
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<{
    txn: SortTxn;
    lines: DraftLine[];
  } | null>(null);
  const [cashRow, setCashRow] = useState<ListRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((current) => ({ ...current, search })),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useQuery({
    ...trpc.transaction.list.queryOptions(toListInput(filters)),
    placeholderData: keepPreviousData,
  });

  const changed = useTransactionsChanged();
  const unsort = useMutation(
    trpc.transaction.unsort.mutationOptions({
      onSuccess: async () => {
        await changed();
        toast.success("Transaction moved back to To sort");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const setFilter = (key: keyof ListFilters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const years = yearsBetween(property.trackingStartDate, property.today);
  const sortedCategories = [...categories].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const filtered = filters.categoryId !== ALL || filters.accountId !== ALL;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.year} onValueChange={setFilter("year")}>
          <SelectTrigger className="w-32" aria-label="Year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All years</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.categoryId}
          onValueChange={setFilter("categoryId")}
        >
          <SelectTrigger className="w-52" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {sortedCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
                <span className="text-muted-foreground ml-2 text-xs">
                  {CATEGORY_KIND_SHORT[category.kind]}
                  {category.archivedAt ? ", archived" : ""}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.accountId}
          onValueChange={setFilter("accountId")}
        >
          <SelectTrigger className="w-60" aria-label="Account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {accountList.accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {accountLabel(account)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.sorted} onValueChange={setFilter("sorted")}>
          <SelectTrigger className="w-36" aria-label="Sorted">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Sorted or not</SelectItem>
            <SelectItem value="sorted">Sorted</SelectItem>
            <SelectItem value="unsorted">Not sorted</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="w-56"
          placeholder="Search descriptions"
          aria-label="Search descriptions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            setFilters(EMPTY_FILTERS);
          }}
        >
          Clear
        </Button>
      </div>

      {data ? (
        <>
          <p className="text-sm">
            {data.rows.length}{" "}
            {data.rows.length === 1 ? "transaction" : "transactions"}.{" "}
            {filtered ? "Total of the matching lines" : "Total"}:{" "}
            <span className={amountClass(data.totalCents)}>
              {formatAmount(data.totalCents)}
            </span>
            {isFetching ? (
              <span className="text-muted-foreground ml-2">Updating...</span>
            ) : null}
          </p>
          {data.rows.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
              No transactions match these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Sorted to</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => {
                      if (row.source === "cash") {
                        setCashRow(row);
                      } else {
                        setSorting({
                          txn: row,
                          lines: draftLinesFrom(row.amountCents, row.lines),
                        });
                      }
                    }}
                  >
                    <TableCell className="whitespace-nowrap">
                      {formatDate(row.postedOn)}
                    </TableCell>
                    <TableCell className="max-w-80">
                      <div className="truncate" title={row.description}>
                        {row.description}
                      </div>
                      {row.source === "cash" ? (
                        <Badge variant="secondary">Cash</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <span className={amountClass(row.amountCents)}>
                        {formatAmount(row.amountCents)}
                      </span>
                      {filtered && row.matchedCents !== row.amountCents ? (
                        <p className="text-muted-foreground text-xs tabular-nums">
                          Matching: {formatCents(row.matchedCents)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.lines.length === 0 ? (
                        <Badge variant="outline">Not sorted</Badge>
                      ) : (
                        <ul className="space-y-0.5 text-sm">
                          {row.lines.map((line, index) => (
                            <li key={index}>
                              {lineName(line, accountList.accounts, categories)}
                              {row.lines.length > 1 ? (
                                <span className="text-muted-foreground ml-2 tabular-nums">
                                  {formatCents(line.amountCents)}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.source === "bank" && row.lines.length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={unsort.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            unsort.mutate({ id: row.id });
                          }}
                        >
                          Unsort
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Loading...</p>
      )}

      <SortDialog
        txn={sorting?.txn ?? null}
        initialLines={sorting?.lines ?? []}
        accounts={accountList.accounts}
        categories={categories}
        open={sorting !== null}
        onOpenChange={(open) => {
          if (!open) setSorting(null);
        }}
      />
      <CashExpenseDialog
        expense={cashRow}
        open={cashRow !== null}
        onOpenChange={(open) => {
          if (!open) setCashRow(null);
        }}
      />
    </div>
  );
}
