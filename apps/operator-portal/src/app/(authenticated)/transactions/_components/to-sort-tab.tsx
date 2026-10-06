"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Search,
  Sparkles,
  Split,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { formatMoney } from "@moonship/ui/money";

import type { DraftLine } from "../_lib/draft";
import type {
  AccountSummary,
  CategoryView,
  ListRow,
  RentRow,
  ToSortRow,
} from "../_lib/transactions";
import { useTRPC } from "~/trpc/react";
import { allocationLines, draftProblem, newDraftLine } from "../_lib/draft";
import {
  choiceIds,
  monthlyRentFor,
  suggestedTarget,
  suggestionNote,
  targetGroups,
  targetName,
} from "../_lib/transactions";
import { formatDate, formatMonthDay } from "../../_lib/format";
import { Amount } from "./amount";
import { SplitEditor } from "./split-editor";
import { TargetList } from "./target-list";
import { useTransactionsChanged } from "./use-transactions-changed";

interface Draft {
  split: boolean;
  lines: DraftLine[];
}

function initialDraft(row: ToSortRow): Draft {
  return {
    split: false,
    lines: [
      newDraftLine(suggestedTarget(row.suggestion), Math.abs(row.amountCents)),
    ],
  };
}

function suggestionLabel(
  row: ToSortRow,
  accounts: readonly AccountSummary[],
  categories: readonly CategoryView[],
): string | null {
  const target = suggestedTarget(row.suggestion);
  if (target !== "") return targetName(target, accounts, categories);
  const choices = choiceIds(row.suggestion);
  if (choices.length > 0) return `${choices.length} possible accounts`;
  return null;
}

export function ToSortTab({ history }: { history: readonly ListRow[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const changed = useTransactionsChanged();
  const { data: rows } = useSuspenseQuery(
    trpc.transaction.listToSort.queryOptions(),
  );
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );
  const { data: categories } = useSuspenseQuery(
    trpc.category.list.queryOptions({ includeArchived: true }),
  );
  const { data: rent } = useSuspenseQuery(trpc.rent.status.queryOptions());
  const { data: batches } = useSuspenseQuery(
    trpc.bankImport.listBatches.queryOptions(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const accounts = accountList.accounts;

  const listKey = trpc.transaction.listToSort.queryKey();
  const allocate = useMutation(
    trpc.transaction.allocate.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        queryClient.setQueryData(listKey, (current) =>
          current?.filter((other) => other.id !== input.id),
        );
      },
      onError: (err) => toast.error(err.message),
      onSettled: () => changed(),
    }),
  );
  const unsort = useMutation(
    trpc.transaction.unsort.mutationOptions({
      onSuccess: async (_saved, input) => {
        await changed();
        setSelectedId(input.id);
        toast.success("Moved back to To sort");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (rows.length === 0) return <AllSorted />;

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  if (!selected) return <AllSorted />;
  const totalIn = rows.reduce(
    (sum, row) => sum + Math.max(row.amountCents, 0),
    0,
  );
  const totalOut = rows.reduce(
    (sum, row) => sum + Math.max(-row.amountCents, 0),
    0,
  );

  const confirm = (row: ToSortRow, draft: Draft) => {
    const index = rows.findIndex((other) => other.id === row.id);
    const next = rows[index + 1] ?? rows[index - 1];
    setSelectedId(next ? next.id : null);
    const names = draft.lines
      .map((line) => targetName(line.target, accounts, categories))
      .join(" + ");
    allocate.mutate(
      { id: row.id, lines: allocationLines(row.amountCents, draft.lines) },
      {
        onSuccess: () =>
          toast.success(`Sorted to ${names}`, {
            action: {
              label: "Undo",
              onClick: () => unsort.mutate({ id: row.id }),
            },
          }),
      },
    );
  };

  return (
    <div className="nav:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] nav:min-h-[calc(100dvh-131px)] grid grid-cols-[minmax(0,1fr)]">
      <div className="border-line max-nav:order-2 max-nav:border-t nav:border-r flex min-w-0 flex-col">
        <div className="border-line text-fg-2 flex items-center justify-between gap-2 border-b px-3.5 py-2.5 text-[12px]">
          <span>
            <span className="font-mono">{rows.length}</span> to sort, newest
            first
          </span>
          <span className="font-mono">
            {formatMoney(totalIn)} in · {formatMoney(totalOut)} out
          </span>
        </div>
        {rows.map((row, index) => (
          <QueueRow
            key={row.id}
            row={row}
            index={index}
            selected={row.id === selected.id}
            target={suggestionLabel(row, accounts, categories)}
            onSelect={() => setSelectedId(row.id)}
          />
        ))}
      </div>
      <div className="max-nav:order-1 min-w-0">
        <Detail
          key={selected.id}
          row={selected}
          history={history}
          accounts={accounts}
          categories={categories}
          rentRows={rent.rows}
          today={rent.today}
          source={
            batches.find((batch) => batch.id === selected.importBatchId)
              ?.fileName ?? "Bank"
          }
          pending={allocate.isPending}
          onConfirm={(draft) => confirm(selected, draft)}
        />
      </div>
    </div>
  );
}

function QueueRow({
  row,
  index,
  selected,
  target,
  onSelect,
}: {
  row: ToSortRow;
  index: number;
  selected: boolean;
  target: string | null;
  onSelect: () => void;
}) {
  const moneyIn = row.amountCents > 0;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{ "--i": Math.min(index, 12) } as CSSProperties}
      className={cn(
        "animate-rise border-line relative grid w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-b px-3.5 py-2.5 text-left transition-colors duration-100",
        selected
          ? "bg-press before:bg-primary before:absolute before:inset-y-0 before:left-0 before:w-0.5"
          : "hover:bg-hover",
      )}
    >
      <DirectionIcon moneyIn={moneyIn} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{row.description}</span>
        <span className="text-fg-3 block truncate text-xs">
          <span className="font-mono">{formatMonthDay(row.postedOn)}</span> ·{" "}
          {target ? (
            <b className="text-fg-2 font-medium">{target}</b>
          ) : (
            "No suggestion"
          )}
        </span>
      </span>
      <Amount cents={row.amountCents} />
    </button>
  );
}

function DirectionIcon({ moneyIn }: { moneyIn: boolean }) {
  return (
    <span
      aria-label={moneyIn ? "Money in" : "Money out"}
      className={cn(
        "grid size-[22px] place-items-center rounded-md border",
        moneyIn
          ? "bg-green-soft text-green border-transparent"
          : "border-line-2 text-fg-2",
      )}
    >
      {moneyIn ? (
        <ArrowDownLeft className="size-[13px]" />
      ) : (
        <ArrowUpRight className="size-[13px]" />
      )}
    </span>
  );
}

function Detail({
  row,
  history,
  accounts,
  categories,
  rentRows,
  today,
  source,
  pending,
  onConfirm,
}: {
  row: ToSortRow;
  history: readonly ListRow[];
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  rentRows: readonly RentRow[];
  today: string;
  source: string;
  pending: boolean;
  onConfirm: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(row));
  const total = Math.abs(row.amountCents);
  const note = suggestionNote({ row, history, accounts, categories });
  const groups = targetGroups({
    amountCents: row.amountCents,
    accounts,
    categories,
    firstAccountIds: choiceIds(row.suggestion),
    accountHint: (account) => {
      const monthly = monthlyRentFor(rentRows, today, account.id, row.postedOn);
      return monthly === null ? "" : `${formatMoney(monthly)} a month`;
    },
  });
  const problem = draftProblem(row.amountCents, draft.lines, draft.split);
  const firstTarget = draft.lines[0]?.target ?? "";

  return (
    <div className="animate-rise nav:px-[22px] nav:pt-5 nav:pb-[22px] flex min-w-0 flex-col gap-4 p-4">
      <div>
        <Amount
          cents={row.amountCents}
          className="text-[28px] font-medium tracking-[-0.035em]"
        />
        <div className="mt-0.5 text-[14px] font-semibold break-words">
          {row.description}
        </div>
        <div className="text-fg-3 mt-[3px] text-[12px]">
          {formatDate(row.postedOn)} ·{" "}
          {row.amountCents > 0 ? "Money in" : "Money out"} · {source}
        </div>
      </div>

      {note.kind === "suggested" ? (
        <div className="border-accent-line bg-accent-soft flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]">
          <Sparkles className="text-primary mt-px size-3.5 shrink-0" />
          <div>
            <b className="font-semibold">Suggested.</b> {note.text} Check it and
            confirm.
          </div>
        </div>
      ) : (
        <div className="border-line-2 bg-sunk text-fg-2 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]">
          <Search className="text-fg-3 mt-px size-3.5 shrink-0" />
          <div>{note.text}</div>
        </div>
      )}

      {draft.split ? (
        <SplitEditor
          amountCents={row.amountCents}
          lines={draft.lines}
          groups={groups}
          onChange={(lines) => setDraft({ split: true, lines })}
        />
      ) : (
        <TargetList
          value={firstTarget}
          groups={groups}
          onChange={(target) =>
            setDraft({ split: false, lines: [newDraftLine(target, total)] })
          }
        />
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-fg-3 min-w-0 flex-1 text-[12px]">{problem}</span>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setDraft(
              draft.split
                ? { split: false, lines: [newDraftLine(firstTarget, total)] }
                : {
                    split: true,
                    lines: [
                      newDraftLine(firstTarget, total),
                      newDraftLine("", null),
                    ],
                  },
            )
          }
        >
          {draft.split ? <X /> : <Split />}
          {draft.split ? "Remove split" : "Split"}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={problem !== null || pending}
          onClick={() => onConfirm(draft)}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

function AllSorted() {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-5 py-20 text-center">
      <div className="bg-green-soft text-green grid size-11 place-items-center rounded-full">
        <Check className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold">Everything is sorted</h3>
      <p className="text-fg-2 max-w-[340px]">
        New bank rows show up here after an import.
      </p>
      <div className="mt-1.5 flex gap-2">
        <Button variant="outline" asChild>
          <Link href="/tenants">See balances</Link>
        </Button>
        <Button variant="primary" asChild>
          <Link href="/transactions/import">
            <Upload />
            Import bank file
          </Link>
        </Button>
      </div>
    </div>
  );
}
