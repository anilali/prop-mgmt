import type { RouterOutputs } from "@moonship/api-operator";
import type { CategoryKind } from "@moonship/billing";
import { parseCents } from "@moonship/shared";
import { formatMoney } from "@moonship/ui/money";

import { formatMonth } from "../../_lib/rent";

export type ToSortRow = RouterOutputs["transaction"]["listToSort"][number];
export type ListRow = RouterOutputs["transaction"]["list"]["rows"][number];
export type Txn = RouterOutputs["transaction"]["get"];
export type TxnLine = Txn["lines"][number];
export type Suggestion = ToSortRow["suggestion"];
export type CategoryView = RouterOutputs["category"]["list"][number];
export type AccountSummary =
  RouterOutputs["account"]["list"]["accounts"][number];
export type RentRow = RouterOutputs["rent"]["status"]["rows"][number];

export type TargetValue = `account:${string}` | `category:${string}`;

export function accountTarget(accountId: string): TargetValue {
  return `account:${accountId}`;
}

export function categoryTarget(categoryId: string): TargetValue {
  return `category:${categoryId}`;
}

export function lineTarget(line: TxnLine): TargetValue | "" {
  if (line.accountId) return accountTarget(line.accountId);
  if (line.categoryId) return categoryTarget(line.categoryId);
  return "";
}

export function targetIds(value: string): {
  accountId: string | null;
  categoryId: string | null;
} {
  if (value.startsWith("account:")) {
    return { accountId: value.slice("account:".length), categoryId: null };
  }
  if (value.startsWith("category:")) {
    return { accountId: null, categoryId: value.slice("category:".length) };
  }
  return { accountId: null, categoryId: null };
}

export function suggestedTarget(suggestion: Suggestion): TargetValue | "" {
  if (suggestion.kind === "account") {
    return accountTarget(suggestion.accountId);
  }
  if (suggestion.kind === "category") {
    return categoryTarget(suggestion.categoryId);
  }
  return "";
}

export function choiceIds(suggestion: Suggestion): string[] {
  return suggestion.kind === "accountChoices" ? suggestion.accountIds : [];
}

export function accountLabel(account: AccountSummary): string {
  const name = account.tenant.businessName || "Tenant";
  return `${name} · ${account.unit.label}`;
}

export const CATEGORY_KIND_SHORT: Record<CategoryKind, string> = {
  shared_cost: "Shared cost",
  owner_expense: "Owner expense",
  income: "Income",
  not_counted: "Not counted",
};

const MONEY_IN_ORDER: CategoryKind[] = [
  "income",
  "shared_cost",
  "not_counted",
  "owner_expense",
];
const MONEY_OUT_ORDER: CategoryKind[] = [
  "shared_cost",
  "owner_expense",
  "not_counted",
  "income",
];

export interface TargetOption {
  value: TargetValue;
  label: string;
  hint: string;
}

export interface TargetGroup {
  label: string;
  options: TargetOption[];
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function categoryHint(kind: CategoryKind, amountCents: number): string {
  if (kind !== "shared_cost") return "";
  return amountCents > 0 ? "Lowers the pool cost" : "Split across the pool";
}

export function categoryGroups({
  categories,
  amountCents,
  kinds,
  keepIds = [],
}: {
  categories: readonly CategoryView[];
  amountCents: number;
  kinds: readonly CategoryKind[];
  keepIds?: readonly string[];
}): TargetGroup[] {
  return kinds
    .map((kind) => ({
      label: CATEGORY_KIND_SHORT[kind],
      options: categories
        .filter(
          (category) =>
            category.kind === kind &&
            (category.archivedAt === null || keepIds.includes(category.id)),
        )
        .sort(byName)
        .map((category) => ({
          value: categoryTarget(category.id),
          label:
            category.archivedAt === null
              ? category.name
              : `${category.name} (archived)`,
          hint: categoryHint(kind, amountCents),
        })),
    }))
    .filter((group) => group.options.length > 0);
}

export function monthlyRentFor(
  rentRows: readonly RentRow[],
  today: string,
  accountId: string,
  date: string,
): number | null {
  if (date.slice(0, 4) !== today.slice(0, 4)) return null;
  const row = rentRows.find((r) => r.accountId === accountId);
  const month = row?.months.find((m) => m.month === Number(date.slice(5, 7)));
  return month && month.expectedCents > 0 ? month.expectedCents : null;
}

export function targetGroups({
  amountCents,
  accounts,
  categories,
  firstAccountIds = [],
  keepCategoryIds = [],
  accountHint,
}: {
  amountCents: number;
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  firstAccountIds?: readonly string[];
  keepCategoryIds?: readonly string[];
  accountHint?: (account: AccountSummary) => string;
}): TargetGroup[] {
  const first = firstAccountIds.flatMap((id) => {
    const account = accounts.find((a) => a.id === id);
    return account ? [account] : [];
  });
  const rest = accounts.filter((a) => !firstAccountIds.includes(a.id));
  const accountGroup: TargetGroup = {
    label: "Tenant accounts",
    options: [...first, ...rest].map((account) => ({
      value: accountTarget(account.id),
      label: accountLabel(account),
      hint: firstAccountIds.includes(account.id)
        ? "Matches this amount"
        : (accountHint?.(account) ?? ""),
    })),
  };
  const groups = categoryGroups({
    categories,
    amountCents,
    kinds: amountCents > 0 ? MONEY_IN_ORDER : MONEY_OUT_ORDER,
    keepIds: keepCategoryIds,
  });
  const all =
    amountCents > 0 ? [accountGroup, ...groups] : [...groups, accountGroup];
  return all.filter((group) => group.options.length > 0);
}

export function targetName(
  target: string,
  accounts: readonly AccountSummary[],
  categories: readonly CategoryView[],
): string {
  const { accountId, categoryId } = targetIds(target);
  if (accountId) {
    const account = accounts.find((a) => a.id === accountId);
    return account ? accountLabel(account) : "Unknown account";
  }
  const category = categories.find((c) => c.id === categoryId);
  return category ? category.name : "Unknown category";
}

export function lineName(
  line: TxnLine,
  accounts: readonly AccountSummary[],
  categories: readonly CategoryView[],
): string {
  return targetName(lineTarget(line), accounts, categories);
}

export function linesName(
  lines: readonly TxnLine[],
  accounts: readonly AccountSummary[],
  categories: readonly CategoryView[],
): string {
  return lines.map((line) => lineName(line, accounts, categories)).join(" + ");
}

export function parseDollars(text: string): number | null {
  if (text.trim() === "") return null;
  try {
    return parseCents(text);
  } catch {
    return null;
  }
}

function earlierCount(
  row: ToSortRow,
  history: readonly ListRow[],
  goesTo: (line: TxnLine) => boolean,
  onOrBefore: boolean,
): number {
  if (row.descriptionKey === "") return 0;
  return history.filter((other) => {
    const [line] = other.lines;
    return (
      other.id !== row.id &&
      other.lines.length === 1 &&
      line !== undefined &&
      other.descriptionKey === row.descriptionKey &&
      (!onOrBefore || other.postedOn <= row.postedOn) &&
      goesTo(line)
    );
  }).length;
}

function historyAccountIds(
  row: ToSortRow,
  history: readonly ListRow[],
): Set<string> {
  if (row.descriptionKey === "") return new Set();
  return new Set(
    history.flatMap((other) => {
      const [line] = other.lines;
      return other.id !== row.id &&
        other.lines.length === 1 &&
        other.descriptionKey === row.descriptionKey &&
        other.postedOn <= row.postedOn &&
        line?.accountId
        ? [line.accountId]
        : [];
    }),
  );
}

function earlierText(count: number, amountCents: number, name: string) {
  const noun = amountCents > 0 ? "deposit" : "payment";
  if (count === 1) {
    return `An earlier ${noun} with this description went to ${name}.`;
  }
  return `${count} earlier ${noun}s with this description went to ${name}.`;
}

export type SuggestionNote =
  | { kind: "suggested"; text: string }
  | { kind: "none"; text: string };

export function suggestionNote({
  row,
  history,
  accounts,
  categories,
}: {
  row: ToSortRow;
  history: readonly ListRow[];
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
}): SuggestionNote {
  const { suggestion } = row;
  if (suggestion.kind === "account") {
    const name = targetName(
      accountTarget(suggestion.accountId),
      accounts,
      categories,
    );
    const fromHistory = historyAccountIds(row, history);
    if (fromHistory.size === 1 && fromHistory.has(suggestion.accountId)) {
      const count = earlierCount(
        row,
        history,
        (line) => line.accountId === suggestion.accountId,
        true,
      );
      return {
        kind: "suggested",
        text:
          count > 0
            ? earlierText(count, row.amountCents, name)
            : "Same description as earlier sorted transactions.",
      };
    }
    return {
      kind: "suggested",
      text: `Matches ${name}'s rent for ${formatMonth(row.postedOn.slice(0, 7))}.`,
    };
  }
  if (suggestion.kind === "accountChoices") {
    const names = suggestion.accountIds.map((id) =>
      targetName(accountTarget(id), accounts, categories),
    );
    return {
      kind: "suggested",
      text: `${formatMoney(row.amountCents)} matches the rent of ${names.join(" and ")}. Pick one, or split.`,
    };
  }
  if (suggestion.kind === "category") {
    const name = targetName(
      categoryTarget(suggestion.categoryId),
      accounts,
      categories,
    );
    const count = earlierCount(
      row,
      history,
      (line) => line.categoryId === suggestion.categoryId,
      false,
    );
    return {
      kind: "suggested",
      text:
        count > 0
          ? earlierText(count, row.amountCents, name)
          : "Same description as earlier sorted transactions.",
    };
  }
  const anyEarlier =
    row.descriptionKey !== "" &&
    history.some(
      (other) =>
        other.id !== row.id &&
        other.lines.length > 0 &&
        other.descriptionKey === row.descriptionKey,
    );
  if (anyEarlier) {
    return {
      kind: "none",
      text: "Earlier transactions with this description don't point to one place. Pick where this one goes.",
    };
  }
  return {
    kind: "none",
    text:
      row.amountCents > 0
        ? "No sorted transaction has this description, and no account expects this amount. Pick where it goes."
        : "No sorted transaction has this description. Pick where it goes.",
  };
}
