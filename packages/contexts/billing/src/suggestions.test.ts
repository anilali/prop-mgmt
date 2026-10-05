import { describe, expect, it } from "vitest";

import type {
  AccountTerms,
  AllocationLine,
  Category,
  LeaseTerms,
  Txn,
} from "./types";
import {
  accountSuggestion,
  categorySuggestion,
  descriptionKey,
  suggestionFor,
} from "./suggestions";

let nextId = 0;

function txn(
  description: string,
  amountCents: number,
  postedOn: string,
  lines: AllocationLine[] = [],
): Txn {
  nextId += 1;
  return {
    id: `t${nextId}`,
    propertyId: "p",
    source: "bank",
    importBatchId: "b",
    postedOn,
    description,
    descriptionKey: descriptionKey(description),
    amountCents,
    externalId: null,
    lines,
  };
}

function toCategory(categoryId: string, amountCents: number): AllocationLine {
  return { accountId: null, categoryId, amountCents };
}

function toAccount(accountId: string, amountCents: number): AllocationLine {
  return { accountId, categoryId: null, amountCents };
}

function category(id: string, archived = false): Category {
  return {
    id,
    propertyId: "p",
    name: id,
    kind: "owner_expense",
    poolId: null,
    archivedAt: archived ? new Date("2026-03-01T00:00:00Z") : null,
  };
}

function lease(startDate: string, rentCents: number): LeaseTerms {
  return {
    leaseId: `l-${startDate}-${rentCents}`,
    startDate,
    endDate: "2030-12-31",
    moveOutDate: null,
    lateFee: null,
    insuranceExpiresOn: null,
    rentSteps: [
      {
        id: "r",
        startsOn: startDate,
        amountCents: rentCents,
        tenantNotifiedAt: null,
      },
    ],
    estimateSteps: [],
  };
}

function account(accountId: string, rentCents: number): AccountTerms {
  return {
    accountId,
    tenantId: "t",
    unitId: `u-${accountId}`,
    openingBalanceCents: 0,
    leases: [lease("2025-01-01", rentCents)],
  };
}

describe("descriptionKey", () => {
  it("lowercases and collapses everything outside a-z", () => {
    expect(descriptionKey("ACH DEP 0412 SUPER-LUCKY LLC")).toBe(
      "ach dep super lucky llc",
    );
    expect(descriptionKey("  #1234  ")).toBe("");
    expect(descriptionKey("Café")).toBe("caf");
  });
});

describe("categorySuggestion", () => {
  const categories = [
    category("repairs"),
    category("cam"),
    category("old", true),
  ];

  it("uses the category of the most recent single-line match", () => {
    const history = [
      txn("HOME DEPOT 123", -5000, "2026-01-05", [toCategory("cam", -5000)]),
      txn("HOME DEPOT 456", -7000, "2026-02-05", [
        toCategory("repairs", -7000),
      ]),
      txn("HOME DEPOT 789", -9000, "2026-03-05", [
        toCategory("cam", -4000),
        toCategory("repairs", -5000),
      ]),
    ];
    const current = txn("HOME DEPOT 999", -1000, "2026-04-01");

    expect(categorySuggestion(current, history, categories)).toBe("repairs");
  });

  it("skips archived categories and falls back to an older match", () => {
    const history = [
      txn("CITY WATER", -5000, "2026-01-05", [toCategory("cam", -5000)]),
      txn("CITY WATER", -5000, "2026-02-05", [toCategory("old", -5000)]),
    ];
    const current = txn("CITY WATER", -5000, "2026-03-05");

    expect(categorySuggestion(current, history, categories)).toBe("cam");
  });

  it("returns null with no sorted match", () => {
    const history = [txn("CITY WATER", -5000, "2026-01-05")];
    const current = txn("CITY WATER", -5000, "2026-03-05");

    expect(categorySuggestion(current, history, categories)).toBeNull();
  });
});

describe("accountSuggestion", () => {
  const accounts = [
    account("a", 365_482),
    account("b", 216_000),
    account("d", 216_000),
  ];

  it("suggests the account that paid from the same description", () => {
    const history = [
      txn("ACH DEP 0112 SUPER-LUCKY LLC", 365_482, "2026-01-02", [
        toAccount("a", 365_482),
      ]),
    ];
    const current = txn("ACH DEP 0212 SUPER-LUCKY LLC", 100_000, "2026-02-02");

    expect(accountSuggestion(current, history, accounts, "2026-01-01")).toEqual(
      {
        kind: "account",
        accountId: "a",
      },
    );
  });

  it("falls back to the expected amount when one key matched two accounts", () => {
    const history = [
      txn("TENANT B AND D", 216_000, "2026-01-02", [toAccount("b", 216_000)]),
      txn("TENANT B AND D", 365_482, "2026-01-03", [toAccount("a", 365_482)]),
    ];
    const current = txn("TENANT B AND D", 365_482, "2026-02-02");

    expect(accountSuggestion(current, history, accounts, "2026-01-01")).toEqual(
      {
        kind: "account",
        accountId: "a",
      },
    );
  });

  it("lists ties as choices with none picked", () => {
    const current = txn("WIRE IN", 216_000, "2026-02-02");

    expect(accountSuggestion(current, [], accounts, "2026-01-01")).toEqual({
      kind: "accountChoices",
      accountIds: ["b", "d"],
    });
  });

  it("does not suggest an account for money out or an amount no one owes", () => {
    expect(
      accountSuggestion(
        txn("WIRE IN", 1, "2026-02-02"),
        [],
        accounts,
        "2026-01-01",
      ),
    ).toEqual({ kind: "none" });
    expect(
      accountSuggestion(
        txn("REFUND", -365_482, "2026-02-02"),
        [],
        accounts,
        "2026-01-01",
      ),
    ).toEqual({ kind: "none" });
  });

  it("ignores months before tracking start", () => {
    const current = txn("WIRE IN", 365_482, "2025-12-02");

    expect(accountSuggestion(current, [], accounts, "2026-01-01")).toEqual({
      kind: "none",
    });
  });
});

describe("suggestionFor", () => {
  const accounts = [account("a", 365_482)];
  const categories = [category("other-income")];

  it("prefers the account for money in and uses the category otherwise", () => {
    const history = [
      txn("ACH DEP SUPER LUCKY", 1000, "2026-01-02", [
        toCategory("other-income", 1000),
      ]),
    ];
    const context = {
      transactions: history,
      accounts,
      categories,
      trackingStart: "2026-01-01",
    };

    expect(
      suggestionFor(txn("ACH DEP SUPER LUCKY", 365_482, "2026-02-02"), context),
    ).toEqual({ kind: "account", accountId: "a" });
    expect(
      suggestionFor(txn("ACH DEP SUPER LUCKY", 2000, "2026-02-02"), context),
    ).toEqual({ kind: "category", categoryId: "other-income" });
    expect(suggestionFor(txn("UNKNOWN", 2000, "2026-02-02"), context)).toEqual({
      kind: "none",
    });
  });
});
