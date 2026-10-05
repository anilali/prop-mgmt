import type { IsoDate } from "@moonship/shared";
import { monthOf } from "@moonship/shared";

import type { AccountTerms, Category, Txn } from "./types";
import { isCounted, monthlyExpected } from "./lease-calendar";

export type Suggestion =
  | { kind: "account"; accountId: string }
  | { kind: "accountChoices"; accountIds: string[] }
  | { kind: "category"; categoryId: string }
  | { kind: "none" };

export function descriptionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function sameKeySorted(txn: Txn, transactions: readonly Txn[]): Txn[] {
  if (txn.descriptionKey === "") return [];
  return transactions.filter(
    (other) =>
      other.id !== txn.id &&
      other.lines.length > 0 &&
      other.descriptionKey === txn.descriptionKey,
  );
}

function newestFirst(transactions: Txn[]): Txn[] {
  return transactions
    .map((txn, index) => ({ txn, index }))
    .sort((a, b) =>
      a.txn.postedOn === b.txn.postedOn
        ? b.index - a.index
        : a.txn.postedOn < b.txn.postedOn
          ? 1
          : -1,
    )
    .map(({ txn }) => txn);
}

export function categorySuggestion(
  txn: Txn,
  transactions: readonly Txn[],
  categories: readonly Category[],
): string | null {
  const active = new Set(
    categories.filter((c) => c.archivedAt === null).map((c) => c.id),
  );
  for (const match of newestFirst(sameKeySorted(txn, transactions))) {
    const line = match.lines.length === 1 ? match.lines[0] : undefined;
    if (line?.categoryId && active.has(line.categoryId)) {
      return line.categoryId;
    }
  }
  return null;
}

export function accountSuggestion(
  txn: Txn,
  transactions: readonly Txn[],
  accounts: readonly AccountTerms[],
  trackingStart: IsoDate | null,
): Suggestion {
  if (txn.amountCents <= 0) return { kind: "none" };

  const fromHistory = new Set(
    sameKeySorted(txn, transactions)
      .filter((match) => match.postedOn <= txn.postedOn)
      .flatMap((match) => {
        const line = match.lines.length === 1 ? match.lines[0] : undefined;
        return line?.accountId ? [line.accountId] : [];
      }),
  );
  const [onlyAccount] = fromHistory;
  if (fromHistory.size === 1 && onlyAccount !== undefined) {
    return { kind: "account", accountId: onlyAccount };
  }

  if (trackingStart === null) return { kind: "none" };
  const month = monthOf(txn.postedOn);
  const matches = accounts
    .filter(
      (account) =>
        isCounted(account, month, trackingStart) &&
        monthlyExpected(account, month) === txn.amountCents,
    )
    .map((account) => account.accountId);
  const [onlyMatch] = matches;
  if (matches.length === 1 && onlyMatch !== undefined) {
    return { kind: "account", accountId: onlyMatch };
  }
  if (matches.length > 1) {
    return { kind: "accountChoices", accountIds: matches };
  }
  return { kind: "none" };
}

export function suggestionFor(
  txn: Txn,
  context: {
    transactions: readonly Txn[];
    accounts: readonly AccountTerms[];
    categories: readonly Category[];
    trackingStart: IsoDate | null;
  },
): Suggestion {
  const account = accountSuggestion(
    txn,
    context.transactions,
    context.accounts,
    context.trackingStart,
  );
  if (account.kind !== "none") return account;
  const categoryId = categorySuggestion(
    txn,
    context.transactions,
    context.categories,
  );
  return categoryId ? { kind: "category", categoryId } : { kind: "none" };
}
