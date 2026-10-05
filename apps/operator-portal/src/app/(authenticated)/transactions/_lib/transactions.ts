import type { RouterInputs, RouterOutputs } from "@moonship/api-operator";
import type { CategoryKind } from "@moonship/billing";
import { CATEGORY_KINDS } from "@moonship/billing";
import { formatCents, parseCents } from "@moonship/shared";

export type ToSortRow = RouterOutputs["transaction"]["listToSort"][number];
export type ListRow = RouterOutputs["transaction"]["list"]["rows"][number];
export type Txn = RouterOutputs["transaction"]["get"];
export type TxnLine = Txn["lines"][number];
export type Suggestion = ToSortRow["suggestion"];
export type CategoryView = RouterOutputs["category"]["list"][number];
export type AccountSummary =
  RouterOutputs["account"]["list"]["accounts"][number];
export type ListInput = NonNullable<RouterInputs["transaction"]["list"]>;

export interface ListFilters {
  year: string;
  categoryId: string;
  accountId: string;
  search: string;
  sorted: string;
}

export const ALL = "all";

export const EMPTY_FILTERS: ListFilters = {
  year: ALL,
  categoryId: ALL,
  accountId: ALL,
  search: "",
  sorted: ALL,
};

export function toListInput(filters: ListFilters): ListInput {
  const input: ListInput = {};
  if (filters.year !== ALL) input.year = Number(filters.year);
  if (filters.categoryId !== ALL) input.categoryId = filters.categoryId;
  if (filters.accountId !== ALL) input.accountId = filters.accountId;
  const search = filters.search.trim();
  if (search !== "") input.search = search;
  if (filters.sorted !== ALL) input.sorted = filters.sorted === "sorted";
  return input;
}

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

export function accountLabel(account: AccountSummary): string {
  const name = account.tenant.businessName || "Tenant";
  return `${name}, unit ${account.unit.label}`;
}

export const CATEGORY_KIND_SHORT: Record<CategoryKind, string> = {
  shared_cost: "Shared cost",
  owner_expense: "Owner expense",
  income: "Income",
  not_counted: "Not counted",
};

export interface TargetOption {
  value: TargetValue;
  label: string;
  kind: string;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function categoryOptions(
  categories: readonly CategoryView[],
  keepIds: readonly string[] = [],
): TargetOption[] {
  return CATEGORY_KINDS.flatMap((kind) =>
    categories
      .filter(
        (category) =>
          category.kind === kind &&
          (category.archivedAt === null || keepIds.includes(category.id)),
      )
      .sort(byName)
      .map((category) => ({
        value: categoryTarget(category.id),
        label: category.name,
        kind:
          category.archivedAt === null
            ? CATEGORY_KIND_SHORT[kind]
            : `${CATEGORY_KIND_SHORT[kind]}, archived`,
      })),
  );
}

export function accountOptions(
  accounts: readonly AccountSummary[],
  firstIds: readonly string[] = [],
): TargetOption[] {
  const first = firstIds.flatMap((id) => {
    const account = accounts.find((a) => a.id === id);
    return account ? [account] : [];
  });
  const rest = accounts.filter((a) => !firstIds.includes(a.id));
  return [...first, ...rest].map((account) => ({
    value: accountTarget(account.id),
    label: accountLabel(account),
    kind: firstIds.includes(account.id) ? "Account, matches" : "Account",
  }));
}

export function targetOptions({
  amountCents,
  accounts,
  categories,
  firstAccountIds = [],
  keepCategoryIds = [],
}: {
  amountCents: number;
  accounts: readonly AccountSummary[];
  categories: readonly CategoryView[];
  firstAccountIds?: readonly string[];
  keepCategoryIds?: readonly string[];
}): TargetOption[] {
  const accountList = accountOptions(accounts, firstAccountIds);
  const categoryList = categoryOptions(categories, keepCategoryIds);
  return amountCents > 0
    ? [...accountList, ...categoryList]
    : [...categoryList, ...accountList];
}

export function lineName(
  line: TxnLine,
  accounts: readonly AccountSummary[],
  categories: readonly CategoryView[],
): string {
  if (line.accountId) {
    const account = accounts.find((a) => a.id === line.accountId);
    return account ? accountLabel(account) : "Unknown account";
  }
  const category = categories.find((c) => c.id === line.categoryId);
  return category ? category.name : "Unknown category";
}

export function formatAmount(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

export function amountClass(cents: number): string {
  return cents > 0
    ? "text-emerald-700 dark:text-emerald-400 tabular-nums"
    : "tabular-nums";
}

export function directionLabel(cents: number): string {
  return cents > 0 ? "In" : "Out";
}

export function parseDollars(text: string): number | null {
  if (text.trim() === "") return null;
  try {
    return parseCents(text);
  } catch {
    return null;
  }
}
