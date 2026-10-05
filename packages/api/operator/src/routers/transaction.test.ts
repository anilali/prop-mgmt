import { describe, expect, it } from "vitest";

import type { CsvMapping } from "@moonship/billing";

import {
  codeOf,
  createTestApp,
  leaseInput,
  TEST_ADDRESS,
} from "../test-setup-stores";

const MAPPING: CsvMapping = {
  dateColumn: "Date",
  dateFormat: "MM/DD/YYYY",
  descriptionColumn: "Description",
  amount: { mode: "signed", column: "Amount", flipSign: false },
  idColumn: null,
};

const CSV = [
  "Date,Description,Amount",
  "1/2/2026,ACH DEP 0102 SUPER-LUCKY LLC,3654.82",
  "1/3/2026,WIRE IN TENANT D,2160.00",
  "1/4/2026,CHECK 1001,5814.82",
  "1/5/2026,HOME DEPOT 123,-120.00",
  "2/5/2026,HOME DEPOT 456,-80.00",
  "2/6/2026,STATE FARM REFUND,300.00",
  "2/7/2026,RETURNED ITEM SUPER LUCKY,-3654.82",
].join("\n");

async function setup() {
  const app = createTestApp();
  const caller = await app.callerFor();
  const a = await caller.unit.create({
    label: "A",
    sqft: 2500,
    address: TEST_ADDRESS,
  });
  const d = await caller.unit.create({
    label: "D",
    sqft: 1250,
    address: TEST_ADDRESS,
  });
  const lucky = await caller.tenant.create({ businessName: "Super Lucky" });
  const tenantD = await caller.tenant.create({ businessName: "Tenant D" });
  if (!lucky || !tenantD) throw new Error("missing tenant");
  const accountA = await caller.account.open({
    tenantId: lucky.id,
    unitId: a.id,
    openingBalanceCents: 0,
    lease: leaseInput({ rentCents: 365_482 }),
  });
  const accountD = await caller.account.open({
    tenantId: tenantD.id,
    unitId: d.id,
    openingBalanceCents: 0,
    lease: leaseInput({ rentCents: 216_000 }),
  });
  await caller.bankImport.commit({
    fileText: CSV,
    fileName: "jan.csv",
    mapping: MAPPING,
  });
  const categories = await caller.category.list();
  const categoryId = (name: string) => {
    const category = categories.find((c) => c.name === name);
    if (!category) throw new Error(`missing category ${name}`);
    return category.id;
  };
  const txnId = (description: string) => {
    const txn = [...app.billing.transactions.values()].find(
      (t) => t.description === description,
    );
    if (!txn) throw new Error(`missing transaction ${description}`);
    return txn.id;
  };
  return {
    app,
    caller,
    accountA: accountA.account.id,
    accountD: accountD.account.id,
    categoryId,
    txnId,
  };
}

describe("transaction procedures", () => {
  it("lists unsorted rows with suggestions and writes nothing", async () => {
    const { app, caller, accountA, accountD, categoryId, txnId } =
      await setup();
    await caller.transaction.allocate({
      id: txnId("HOME DEPOT 123"),
      lines: [{ categoryId: categoryId("Repairs"), amountCents: -12_000 }],
    });
    const before = structuredClone(app.billing.transactions);

    const rows = await caller.transaction.listToSort();

    expect(app.billing.transactions).toEqual(before);
    expect(rows.every((row) => row.lines.length === 0)).toBe(true);
    expect(rows.map((row) => row.description)).not.toContain("HOME DEPOT 123");
    const suggestion = (description: string) =>
      rows.find((row) => row.description === description)?.suggestion;
    expect(suggestion("ACH DEP 0102 SUPER-LUCKY LLC")).toEqual({
      kind: "account",
      accountId: accountA,
    });
    expect(suggestion("WIRE IN TENANT D")).toEqual({
      kind: "account",
      accountId: accountD,
    });
    expect(suggestion("HOME DEPOT 456")).toEqual({
      kind: "category",
      categoryId: categoryId("Repairs"),
    });
    expect(suggestion("CHECK 1001")).toEqual({ kind: "none" });
    expect(rows[0]?.postedOn).toBe("2026-02-07");
  });

  it("rejects lines that do not add up or that have both or neither target", async () => {
    const { app, caller, accountA, categoryId, txnId } = await setup();
    const id = txnId("ACH DEP 0102 SUPER-LUCKY LLC");

    expect(
      await codeOf(
        caller.transaction.allocate({
          id,
          lines: [{ accountId: accountA, amountCents: 365_481 }],
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.transaction.allocate({
          id,
          lines: [
            {
              accountId: accountA,
              categoryId: categoryId("Other income"),
              amountCents: 365_482,
            },
          ],
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.transaction.allocate({ id, lines: [{ amountCents: 365_482 }] }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.transaction.allocate({
          id,
          lines: [
            {
              accountId: "99999999-9999-4999-8999-999999999999",
              amountCents: 365_482,
            },
          ],
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(app.billing.transactions.get(id)?.lines).toEqual([]);
  });

  it("accepts a split across two accounts and replaces earlier lines", async () => {
    const { caller, accountA, accountD, categoryId, txnId } = await setup();
    const id = txnId("CHECK 1001");
    await caller.transaction.allocate({
      id,
      lines: [{ categoryId: categoryId("Other income"), amountCents: 581_482 }],
    });

    const sorted = await caller.transaction.allocate({
      id,
      lines: [
        { accountId: accountA, amountCents: 365_482 },
        { accountId: accountD, amountCents: 216_000 },
      ],
    });

    expect(sorted.lines).toEqual([
      { accountId: accountA, categoryId: null, amountCents: 365_482 },
      { accountId: accountD, categoryId: null, amountCents: 216_000 },
    ]);
    expect((await caller.transaction.get({ id })).lines).toHaveLength(2);
  });

  it("sorts a deposit to a shared-cost category and a withdrawal to an account", async () => {
    const { caller, accountA, categoryId, txnId } = await setup();

    const refund = await caller.transaction.allocate({
      id: txnId("STATE FARM REFUND"),
      lines: [{ categoryId: categoryId("Insurance"), amountCents: 30_000 }],
    });
    const bounced = await caller.transaction.allocate({
      id: txnId("RETURNED ITEM SUPER LUCKY"),
      lines: [{ accountId: accountA, amountCents: -365_482 }],
    });

    expect(refund.lines).toHaveLength(1);
    expect(bounced.lines[0]?.amountCents).toBe(-365_482);
    expect(await codeOf(caller.account.remove({ id: accountA }))).toBe(
      "CONFLICT",
    );
    const insurance = (await caller.pool.list()).find(
      (p) => p.name === "Insurance",
    );
    if (!insurance) throw new Error("missing pool");
    expect(await codeOf(caller.pool.remove({ id: insurance.id }))).toBe(
      "CONFLICT",
    );
  });

  it("unsorts a transaction", async () => {
    const { caller, accountA, txnId } = await setup();
    const id = txnId("ACH DEP 0102 SUPER-LUCKY LLC");
    await caller.transaction.allocate({
      id,
      lines: [{ accountId: accountA, amountCents: 365_482 }],
    });

    const unsorted = await caller.transaction.unsort({ id });

    expect(unsorted.lines).toEqual([]);
    expect(
      (await caller.transaction.listToSort()).some((row) => row.id === id),
    ).toBe(true);
  });

  it("filters the full list and totals the matching lines", async () => {
    const { caller, accountA, accountD, categoryId, txnId } = await setup();
    await caller.transaction.allocate({
      id: txnId("CHECK 1001"),
      lines: [
        { accountId: accountA, amountCents: 365_482 },
        { accountId: accountD, amountCents: 216_000 },
      ],
    });
    await caller.transaction.allocate({
      id: txnId("ACH DEP 0102 SUPER-LUCKY LLC"),
      lines: [{ accountId: accountA, amountCents: 365_482 }],
    });
    await caller.transaction.allocate({
      id: txnId("HOME DEPOT 123"),
      lines: [{ categoryId: categoryId("Repairs"), amountCents: -12_000 }],
    });

    const all = await caller.transaction.list();
    expect(all.rows).toHaveLength(7);
    expect(all.totalCents).toBe(
      365_482 + 216_000 + 581_482 - 12_000 - 8_000 + 30_000 - 365_482,
    );

    const forA = await caller.transaction.list({ accountId: accountA });
    expect(forA.rows).toHaveLength(2);
    expect(forA.totalCents).toBe(730_964);

    const repairs = await caller.transaction.list({
      categoryId: categoryId("Repairs"),
    });
    expect(repairs.totalCents).toBe(-12_000);

    expect(
      (await caller.transaction.list({ sorted: false })).rows,
    ).toHaveLength(4);
    expect(
      (await caller.transaction.list({ search: "home depot" })).rows,
    ).toHaveLength(2);
    expect((await caller.transaction.list({ year: 2025 })).rows).toHaveLength(
      0,
    );
  });

  it("creates, updates, and removes a cash expense with its single line", async () => {
    const { app, caller, categoryId, txnId } = await setup();

    const created = await caller.transaction.createCash({
      date: "2026-02-10",
      description: " Hardware store ",
      amountCents: 4_250,
      categoryId: categoryId("Repairs"),
    });
    expect(created.source).toBe("cash");
    expect(created.description).toBe("Hardware store");
    expect(created.amountCents).toBe(-4_250);
    expect(created.lines).toEqual([
      {
        accountId: null,
        categoryId: categoryId("Repairs"),
        amountCents: -4_250,
      },
    ]);

    const updated = await caller.transaction.updateCash({
      id: created.id,
      date: "2026-02-11",
      description: "Light bulbs",
      amountCents: 1_000,
      categoryId: categoryId("Owner utilities"),
    });
    expect(updated.postedOn).toBe("2026-02-11");
    expect(updated.lines).toEqual([
      {
        accountId: null,
        categoryId: categoryId("Owner utilities"),
        amountCents: -1_000,
      },
    ]);

    expect(
      await codeOf(
        caller.transaction.allocate({
          id: created.id,
          lines: [{ categoryId: categoryId("Repairs"), amountCents: -1_000 }],
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(caller.transaction.removeCash({ id: txnId("CHECK 1001") })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.transaction.updateCash({
          id: txnId("CHECK 1001"),
          date: "2026-02-11",
          description: "X",
          amountCents: 1,
          categoryId: categoryId("Repairs"),
        }),
      ),
    ).toBe("BAD_REQUEST");

    expect(await caller.transaction.removeCash({ id: created.id })).toEqual({
      ok: true,
    });
    expect(app.billing.transactions.has(created.id)).toBe(false);
  });

  it("rejects a cash expense before tracking start or with an unknown category", async () => {
    const { caller, categoryId } = await setup();

    expect(
      await codeOf(
        caller.transaction.createCash({
          date: "2025-12-31",
          description: "Old",
          amountCents: 100,
          categoryId: categoryId("Repairs"),
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.transaction.createCash({
          date: "2026-01-31",
          description: "X",
          amountCents: 100,
          categoryId: "99999999-9999-4999-8999-999999999999",
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.transaction.createCash({
          date: "2026-01-31",
          description: "X",
          amountCents: -100,
          categoryId: categoryId("Repairs"),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("blocks a tracking start change once a transaction exists", async () => {
    const { caller } = await setup();

    expect(
      await codeOf(caller.property.update({ trackingStartDate: "2026-02-01" })),
    ).toBe("CONFLICT");
  });

  it("returns NOT_FOUND for an unknown transaction", async () => {
    const { caller } = await setup();
    const id = "99999999-9999-4999-8999-999999999999";

    expect(await codeOf(caller.transaction.get({ id }))).toBe("NOT_FOUND");
    expect(await codeOf(caller.transaction.unsort({ id }))).toBe("NOT_FOUND");
  });
});
