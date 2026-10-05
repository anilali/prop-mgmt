import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Txn } from "@moonship/billing";
import {
  ACCOUNTS,
  CATEGORIES,
  EXPENSES,
  LETTER,
  POOL_LIST,
  RECONCILIATION_UNITS,
  superLucky,
  tenantB,
  tenantD,
  TENANTS,
  TRANSACTIONS,
} from "@moonship/billing/fixtures/2024";

import type { TestCaller } from "../test-setup-stores";
import {
  codeOf,
  createTestApp,
  PLATFORM_ADMIN,
  PROPERTY_ID,
  STRANGER,
} from "../test-setup-stores";

const ID = "66666666-6666-4666-8666-666666666666";

function useToday(date: string) {
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("TODAY_OVERRIDE", date);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

type App = ReturnType<typeof createTestApp>;

function seed2024(app: App) {
  const ids = new Map<string, string>();
  const uid = (key: string) => {
    const existing = ids.get(key);
    if (existing) return existing;
    const id = randomUUID();
    ids.set(key, id);
    return id;
  };

  const property = app.properties.properties.get(PROPERTY_ID);
  if (!property) throw new Error("missing property");
  property.trackingStartDate = "2024-01-01";
  property.letter = { ...LETTER };

  const seededPools = [...app.billing.pools.values()];
  const poolIdOf = (fixturePoolId: string) => {
    const name = POOL_LIST.find((pool) => pool.id === fixturePoolId)?.name;
    const pool = seededPools.find((p) => p.name === name);
    if (!pool) throw new Error(`missing pool ${fixturePoolId}`);
    return pool.id;
  };
  for (const fixturePool of POOL_LIST) {
    const pool = app.billing.pools.get(poolIdOf(fixturePool.id));
    if (pool) pool.unitIds = fixturePool.unitIds.map(uid);
  }

  const categoryIdOf = (fixtureCategoryId: string) => {
    const fixture = CATEGORIES.find((c) => c.id === fixtureCategoryId);
    const category = [...app.billing.categories.values()].find((c) =>
      fixture?.poolId
        ? c.poolId === poolIdOf(fixture.poolId)
        : c.name === fixture?.name,
    );
    if (!category) throw new Error(`missing category ${fixtureCategoryId}`);
    return category.id;
  };

  for (const unit of RECONCILIATION_UNITS) {
    app.units.units.set(uid(unit.id), {
      id: uid(unit.id),
      propertyId: PROPERTY_ID,
      label: unit.label,
      sqft: unit.sqft,
      sqftChangedOn: null,
      address: unit.address,
    });
  }
  for (const tenant of TENANTS) {
    app.tenants.tenants.set(uid(tenant.id), {
      id: uid(tenant.id),
      propertyId: PROPERTY_ID,
      businessName: tenant.businessName,
      ...(tenant.mailingAddress
        ? { mailingAddress: tenant.mailingAddress }
        : {}),
      status: "active",
    });
  }
  for (const account of ACCOUNTS) {
    app.accounts.accounts.set(uid(account.accountId), {
      id: uid(account.accountId),
      propertyId: PROPERTY_ID,
      tenantId: uid(account.tenantId),
      unitId: uid(account.unitId),
      openingBalanceCents: account.openingBalanceCents,
      leases: account.leases.map((lease) => ({
        id: uid(lease.leaseId),
        startDate: lease.startDate,
        endDate: lease.endDate,
        moveOutDate: lease.moveOutDate,
        lateFee: lease.lateFee,
        insuranceExpiresOn: lease.insuranceExpiresOn,
        rentSteps: lease.rentSteps.map((step) => ({
          ...step,
          id: uid(step.id),
        })),
        estimateSteps: lease.estimateSteps.map((step) => ({
          ...step,
          id: uid(step.id),
          poolId: poolIdOf(step.poolId),
        })),
      })),
    });
  }
  for (const txn of [...TRANSACTIONS, ...EXPENSES]) {
    const mapped: Txn = {
      ...txn,
      id: uid(txn.id),
      propertyId: PROPERTY_ID,
      lines: txn.lines.map((line) => ({
        accountId: line.accountId ? uid(line.accountId) : null,
        categoryId: line.categoryId ? categoryIdOf(line.categoryId) : null,
        amountCents: line.amountCents,
      })),
    };
    app.billing.transactions.set(mapped.id, mapped);
  }

  return {
    accountId: (fixtureId: string) => uid(fixtureId),
    poolId: poolIdOf,
  };
}

async function setup(today = "2025-01-08") {
  useToday(today);
  const app = createTestApp();
  const ids = seed2024(app);
  const caller = await app.callerFor();
  return { app, caller, ids };
}

describe("reconciliation procedures need property mode and membership", () => {
  const calls: [string, (caller: TestCaller) => Promise<unknown>][] = [
    ["reconciliation.listYears", (c) => c.reconciliation.listYears()],
    [
      "reconciliation.workspace",
      (c) => c.reconciliation.workspace({ year: 2026 }),
    ],
    [
      "reconciliation.setLetterDate",
      (c) =>
        c.reconciliation.setLetterDate({
          year: 2026,
          letterDate: "2027-01-04",
        }),
    ],
    [
      "reconciliation.setBillOverride",
      (c) =>
        c.reconciliation.setBillOverride({
          year: 2026,
          poolId: ID,
          amountCents: 100,
          note: "Bill",
        }),
    ],
    [
      "reconciliation.clearBillOverride",
      (c) => c.reconciliation.clearBillOverride({ year: 2026, poolId: ID }),
    ],
    [
      "reconciliation.previewPdf",
      (c) => c.reconciliation.previewPdf({ year: 2026, accountId: ID }),
    ],
  ];

  it.each(calls)("%s rejects platform mode", async (_name, call) => {
    const caller = await createTestApp().callerFor(PLATFORM_ADMIN, "platform");
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });

  it.each(calls)("%s rejects a non-member", async (_name, call) => {
    const caller = await createTestApp().callerFor(STRANGER);
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });
});

describe("reconciliation.listYears", () => {
  it("lists years from the tracking start year to this year, newest first", async () => {
    const { app, caller } = await setup("2026-11-16");
    app.billing.reconciliationYears.set("y", {
      id: "y",
      propertyId: PROPERTY_ID,
      year: 2025,
      status: "finalized",
      letterDate: "2026-01-02",
      finalizedAt: new Date("2026-01-05T00:00:00Z"),
    });

    const result = await caller.reconciliation.listYears();

    expect(result.today).toBe("2026-11-16");
    expect(result.years.map((y) => [y.year, y.status, y.letterDate])).toEqual([
      [2026, "draft", null],
      [2025, "finalized", "2026-01-02"],
      [2024, "draft", null],
    ]);
  });

  it("lists nothing without a tracking start date", async () => {
    useToday("2026-11-16");
    const caller = await createTestApp({ trackingStartDate: null }).callerFor();
    const result = await caller.reconciliation.listYears();
    expect(result.trackingStart).toBeNull();
    expect(result.years).toEqual([]);
  });
});

describe("reconciliation.workspace", () => {
  it("matches the section 6 statements and writes nothing", async () => {
    const { app, caller, ids } = await setup();
    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });
    const before = structuredClone(app.billing.reconciliationYears);

    const result = await caller.reconciliation.workspace({ year: 2024 });

    expect(app.billing.reconciliationYears).toEqual(before);
    expect(result.isDryRun).toBe(false);
    expect(result.checklist).toEqual([]);
    expect(result.canFinalize).toBe(true);
    expect(
      result.statements.map((s) => [
        s.accountId,
        s.trueUpCents,
        s.priorBalanceCents,
        s.balanceOnAccountCents,
        s.continuing?.newMonthlyRentCents ?? null,
        s.canPreview,
      ]),
    ).toEqual([
      [
        ids.accountId(superLucky.accountId),
        23_774,
        41_374,
        65_148,
        367_464,
        true,
      ],
      [
        ids.accountId(tenantB.accountId),
        -108_454,
        25_000,
        -83_454,
        416_170,
        true,
      ],
      [ids.accountId(tenantD.accountId), 21_853, 0, 21_853, null, true],
    ]);
    expect(result.statements[0]).not.toHaveProperty("data");
    expect(
      result.pools.map((pool) => [pool.name, pool.actualCents, pool.poolSqft]),
    ).toEqual([
      ["CAM", 1_289_119, 9350],
      ["Taxes", 3_354_231, 9350],
      ["Insurance", 628_400, 9350],
      ["Water", 187_917, 4350],
    ]);
    expect(result.pools[0]?.lines).toHaveLength(3);
  });

  it("uses today's balance and flags a dry run before December 31", async () => {
    const { caller } = await setup("2024-11-16");
    const result = await caller.reconciliation.workspace({ year: 2024 });
    expect(result.isDryRun).toBe(true);
    expect(result.priorBalanceAsOf).toBe("2024-11-16");
    expect(result.gates.todayAfterYearEnd).toBe(false);
    expect(result.canFinalize).toBe(false);
  });

  it("rejects a year outside the tracking start year and this year", async () => {
    const { caller } = await setup();
    expect(await codeOf(caller.reconciliation.workspace({ year: 2023 }))).toBe(
      "BAD_REQUEST",
    );
    expect(await codeOf(caller.reconciliation.workspace({ year: 2026 }))).toBe(
      "BAD_REQUEST",
    );
  });

  it("asks for a tracking start date", async () => {
    useToday("2026-11-16");
    const caller = await createTestApp({ trackingStartDate: null }).callerFor();
    expect(await codeOf(caller.reconciliation.workspace({ year: 2026 }))).toBe(
      "BAD_REQUEST",
    );
  });
});

describe("reconciliation.setLetterDate", () => {
  it("creates the year on the first write and updates it after", async () => {
    const { app, caller } = await setup();

    const first = await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });
    const second = await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-03",
    });

    expect(second.id).toBe(first.id);
    expect(second.letterDate).toBe("2025-01-03");
    expect(app.billing.reconciliationYears.size).toBe(1);
    const result = await caller.reconciliation.workspace({ year: 2024 });
    expect(result.letterDate).toBe("2025-01-03");
  });

  it("rejects a finalized year", async () => {
    const { app, caller } = await setup();
    const record = await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });
    const stored = app.billing.reconciliationYears.get(record.id);
    if (!stored) throw new Error("missing year");
    stored.status = "finalized";
    stored.finalizedAt = new Date();

    expect(
      await codeOf(
        caller.reconciliation.setLetterDate({
          year: 2024,
          letterDate: "2025-01-02",
        }),
      ),
    ).toBe("CONFLICT");
    expect(app.billing.reconciliationYears.get(record.id)?.letterDate).toBe(
      "2025-01-01",
    );
  });
});

describe("bill amounts", () => {
  it("sets, replaces, and clears a pool's bill amount", async () => {
    const { app, caller, ids } = await setup();
    const taxes = ids.poolId(POOL_LIST[1]?.id ?? "");

    await caller.reconciliation.setBillOverride({
      year: 2024,
      poolId: taxes,
      amountCents: 3_000_000,
      note: "First",
    });
    const saved = await caller.reconciliation.setBillOverride({
      year: 2024,
      poolId: taxes,
      amountCents: 3_400_000,
      note: "  2024 county bill ",
    });

    expect(saved).toMatchObject({
      year: 2024,
      amountCents: 3_400_000,
      note: "2024 county bill",
    });
    expect(app.billing.billOverrides.size).toBe(1);
    const withBill = await caller.reconciliation.workspace({ year: 2024 });
    const pool = withBill.pools.find((p) => p.poolId === taxes);
    expect(pool?.actualCents).toBe(3_400_000);
    expect(pool?.categoryTotalCents).toBe(3_354_231);
    expect(pool?.billOverride?.note).toBe("2024 county bill");

    await caller.reconciliation.clearBillOverride({
      year: 2024,
      poolId: taxes,
    });

    expect(app.billing.billOverrides.size).toBe(0);
    const cleared = await caller.reconciliation.workspace({ year: 2024 });
    expect(cleared.pools.find((p) => p.poolId === taxes)?.actualCents).toBe(
      3_354_231,
    );
  });

  it("clears nothing for a year with no row and creates no row", async () => {
    const { app, caller, ids } = await setup();
    const result = await caller.reconciliation.clearBillOverride({
      year: 2024,
      poolId: ids.poolId(POOL_LIST[0]?.id ?? ""),
    });
    expect(result).toEqual({ ok: true });
    expect(app.billing.reconciliationYears.size).toBe(0);
  });

  it("rejects an unknown pool, a negative amount, and an empty note", async () => {
    const { caller, ids } = await setup();
    const cam = ids.poolId(POOL_LIST[0]?.id ?? "");
    expect(
      await codeOf(
        caller.reconciliation.setBillOverride({
          year: 2024,
          poolId: ID,
          amountCents: 1,
          note: "Bill",
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        caller.reconciliation.setBillOverride({
          year: 2024,
          poolId: cam,
          amountCents: -1,
          note: "Bill",
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.reconciliation.setBillOverride({
          year: 2024,
          poolId: cam,
          amountCents: 1,
          note: "   ",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects bill amount writes to a finalized year", async () => {
    const { app, caller, ids } = await setup();
    const cam = ids.poolId(POOL_LIST[0]?.id ?? "");
    await caller.reconciliation.setBillOverride({
      year: 2024,
      poolId: cam,
      amountCents: 1_000,
      note: "Bill",
    });
    for (const record of app.billing.reconciliationYears.values()) {
      record.status = "finalized";
      record.letterDate = "2025-01-01";
      record.finalizedAt = new Date();
    }

    expect(
      await codeOf(
        caller.reconciliation.setBillOverride({
          year: 2024,
          poolId: cam,
          amountCents: 2_000,
          note: "Bill",
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      await codeOf(
        caller.reconciliation.clearBillOverride({ year: 2024, poolId: cam }),
      ),
    ).toBe("CONFLICT");
    expect([...app.billing.billOverrides.values()][0]?.amountCents).toBe(1_000);
    expect(await app.billing.listFinalizedYears(PROPERTY_ID)).toEqual([2024]);
  });
});

describe("reconciliation.previewPdf", () => {
  it("renders the account's statement and returns base64 with the file name", async () => {
    const { app, caller, ids } = await setup();
    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });

    const result = await caller.reconciliation.previewPdf({
      year: 2024,
      accountId: ids.accountId(tenantB.accountId),
    });

    expect(result.fileName).toBe("2024 Reconciliation Tenant B Inc B.pdf");
    expect(Buffer.from(result.base64, "base64").toString()).toBe(
      "%PDF-fake Tenant B Inc",
    );
    expect(app.renderer.rendered).toHaveLength(1);
    expect(app.renderer.rendered[0]).toMatchObject({
      year: 2024,
      letterDate: "2025-01-01",
      trueUpCents: -108_454,
      balanceOnAccountCents: -83_454,
      otherPoolAreas: [{ name: "Water", sqft: 4350 }],
    });
  });

  it("uses today as the letter date until one is set", async () => {
    const { app, caller, ids } = await setup();
    await caller.reconciliation.previewPdf({
      year: 2024,
      accountId: ids.accountId(superLucky.accountId),
    });
    expect(app.renderer.rendered[0]?.letterDate).toBe("2025-01-08");
  });

  it("rejects an account with no statement", async () => {
    const { caller } = await setup();
    expect(
      await codeOf(
        caller.reconciliation.previewPdf({ year: 2024, accountId: ID }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("rejects a statement with a pool that has no units", async () => {
    const { app, caller, ids } = await setup();
    const water = app.billing.pools.get(ids.poolId(POOL_LIST[3]?.id ?? ""));
    if (!water) throw new Error("missing water pool");
    water.unitIds = [];

    expect(
      await codeOf(
        caller.reconciliation.previewPdf({
          year: 2024,
          accountId: ids.accountId(tenantB.accountId),
        }),
      ),
    ).toBe("BAD_REQUEST");
    const result = await caller.reconciliation.workspace({ year: 2024 });
    expect(result.checklist.map((item) => item.code)).toContain(
      "pool_has_no_units",
    );
  });
});
