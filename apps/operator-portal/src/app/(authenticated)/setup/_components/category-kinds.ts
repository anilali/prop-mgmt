import type { CategoryKind } from "@moonship/billing";

export const CATEGORY_KIND_LABELS: Record<
  CategoryKind,
  { title: string; description: string }
> = {
  shared_cost: {
    title: "Shared cost",
    description:
      "Costs split across a pool. Rename or remove the pool to change these.",
  },
  owner_expense: {
    title: "Owner expense",
    description: "Costs the owner pays alone.",
  },
  income: {
    title: "Income",
    description: "Money in that isn't a tenant payment.",
  },
  not_counted: {
    title: "Not counted",
    description: "Left out of all totals.",
  },
};
