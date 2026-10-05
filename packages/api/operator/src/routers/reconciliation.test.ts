import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Txn } from "@moonship/billing";
import type { Lease } from "@moonship/lease-mgmt";
import {
  ACCOUNTS,
  CATEGORIES,
  EXPENSES,
  LETTER,
  POOL_LIST,
  POOLS,
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
  leaseInput,
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
      version: 0,
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
    [
      "reconciliation.finalize",
      (c) => c.reconciliation.finalize({ year: 2026 }),
    ],
    [
      "reconciliation.downloadUrl",
      (c) => c.reconciliation.downloadUrl({ year: 2026, accountId: ID }),
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

  it("starts at the first full year after a mid-year tracking start", async () => {
    const { app, caller } = await setup("2026-11-16");
    const property = app.properties.properties.get(PROPERTY_ID);
    if (!property) throw new Error("missing property");
    property.trackingStartDate = "2024-04-01";

    const result = await caller.reconciliation.listYears();

    expect(result.years.map((y) => y.year)).toEqual([2026, 2025]);
  });

  it("lists nothing while the first full year is still ahead", async () => {
    const { app, caller } = await setup("2026-11-16");
    const property = app.properties.properties.get(PROPERTY_ID);
    if (!property) throw new Error("missing property");
    property.trackingStartDate = "2026-04-01";

    const result = await caller.reconciliation.listYears();

    expect(result.years).toEqual([]);
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

  it("stops the dry-run balance at the newest bank date", async () => {
    const { app, caller } = await setup("2024-11-16");
    for (const txn of [...app.billing.transactions.values()]) {
      if (txn.postedOn > "2024-10-02") app.billing.transactions.delete(txn.id);
    }
    const result = await caller.reconciliation.workspace({ year: 2024 });
    expect(result.isDryRun).toBe(true);
    expect(result.priorBalanceAsOf).toBe("2024-10-02");
    expect(
      result.statements.map((statement) => statement.priorBalanceAsOf),
    ).toEqual(result.statements.map(() => "2024-10-02"));
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

  it("rejects the partial year of a mid-year tracking start", async () => {
    const { app, caller } = await setup("2025-11-16");
    const property = app.properties.properties.get(PROPERTY_ID);
    if (!property) throw new Error("missing property");
    property.trackingStartDate = "2024-04-01";
    expect(await codeOf(caller.reconciliation.workspace({ year: 2024 }))).toBe(
      "BAD_REQUEST",
    );
    const result = await caller.reconciliation.workspace({ year: 2025 });
    expect(result.year).toBe(2025);
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

  it("needs a letter date in the year after", async () => {
    const { app, caller } = await setup();
    for (const letterDate of ["2024-12-31", "2026-01-01"]) {
      await expect(
        caller.reconciliation.setLetterDate({ year: 2024, letterDate }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "The letter date must be in 2025, the year after 2024",
      });
    }
    expect(app.billing.reconciliationYears.size).toBe(0);

    const record = await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-12-31",
    });
    expect(record.letterDate).toBe("2025-12-31");
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

  it("rejects a finalized year and points to the download", async () => {
    const { app, caller, ids } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });
    const rendered = app.renderer.rendered.length;

    await expect(
      caller.reconciliation.previewPdf({
        year: 2024,
        accountId: ids.accountId(tenantB.accountId),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "2024 is finalized. Download the statement that was sent instead.",
    });
    expect(app.renderer.rendered).toHaveLength(rendered);
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

async function setupForFinalize(today = "2025-01-08") {
  const result = await setup(today);
  await result.caller.reconciliation.setLetterDate({
    year: 2024,
    letterDate: "2025-01-01",
  });
  return result;
}

function storeState(app: App) {
  return structuredClone({
    years: [...app.billing.reconciliationYears.values()],
    snapshots: [...app.billing.statementSnapshots.values()],
    entries: [...app.billing.ledgerEntries.values()],
    accounts: [...app.accounts.accounts.values()],
  });
}

function januarySteps(app: App, accountId: string) {
  return (app.accounts.accounts.get(accountId)?.leases ?? []).map((lease) =>
    lease.estimateSteps
      .filter((step) => step.startsOn === "2025-01-01")
      .map((step) => step.amountCents)
      .sort((a, b) => a - b),
  );
}

function editLeases(
  app: App,
  accountId: string,
  edit: (leases: Lease[]) => Lease[],
) {
  const account = app.accounts.accounts.get(accountId);
  if (!account) throw new Error("missing account");
  account.leases = edit(account.leases);
}

describe("reconciliation.finalize", () => {
  it("writes snapshots, true-ups, and January estimate steps for the section 6 data", async () => {
    const { app, caller, ids } = await setupForFinalize();
    const superLuckyId = ids.accountId(superLucky.accountId);
    const tenantBId = ids.accountId(tenantB.accountId);
    const tenantDId = ids.accountId(tenantD.accountId);

    const result = await caller.reconciliation.finalize({ year: 2024 });

    expect(result).toMatchObject({
      year: 2024,
      status: "finalized",
      letterDate: "2025-01-01",
    });
    expect(
      result.statements.map((s) => [
        s.accountId,
        s.fileName,
        s.trueUpCents,
        s.balanceOnAccountCents,
        s.newMonthlyRentCents,
        s.newEstimateSteps,
      ]),
    ).toEqual([
      [
        superLuckyId,
        "2024 Reconciliation Super Lucky LLC A.pdf",
        23_774,
        65_148,
        367_464,
        3,
      ],
      [
        tenantBId,
        "2024 Reconciliation Tenant B Inc B.pdf",
        -108_454,
        -83_454,
        416_170,
        4,
      ],
      [
        tenantDId,
        "2024 Reconciliation Tenant D Co D.pdf",
        21_853,
        21_853,
        null,
        0,
      ],
    ]);

    const snapshots = [...app.billing.statementSnapshots.values()];
    expect(snapshots.map((s) => [s.accountId, s.pdfStorageKey])).toEqual([
      [superLuckyId, `reconciliations/${PROPERTY_ID}/2024/${superLuckyId}.pdf`],
      [tenantBId, `reconciliations/${PROPERTY_ID}/2024/${tenantBId}.pdf`],
      [tenantDId, `reconciliations/${PROPERTY_ID}/2024/${tenantDId}.pdf`],
    ]);
    expect(app.blob.puts).toEqual(snapshots.map((s) => s.pdfStorageKey));
    expect(
      app.blob.objects.get(snapshots[0]?.pdfStorageKey ?? "")?.contentType,
    ).toBe("application/pdf");
    expect(app.renderer.rendered.map((d) => d.letterDate)).toEqual([
      "2025-01-01",
      "2025-01-01",
      "2025-01-01",
    ]);

    const year = [...app.billing.reconciliationYears.values()][0];
    expect(year).toMatchObject({
      status: "finalized",
      letterDate: "2025-01-01",
    });
    expect(year?.finalizedAt).toBeInstanceOf(Date);
    expect(
      [...app.billing.ledgerEntries.values()].map((e) => [
        e.accountId,
        e.kind,
        e.entryDate,
        e.amountCents,
        e.reconciliationYearId,
      ]),
    ).toEqual([
      [superLuckyId, "true_up", "2025-01-01", 23_774, year?.id],
      [tenantBId, "true_up", "2025-01-01", -108_454, year?.id],
      [tenantDId, "true_up", "2025-01-01", 21_853, year?.id],
    ]);

    expect(januarySteps(app, superLuckyId)).toEqual([[14_002, 28_724, 74_738]]);
    expect(januarySteps(app, tenantBId)).toEqual([
      [],
      [7_200, 11_201, 22_979, 59_790],
    ]);
    expect(januarySteps(app, tenantDId)).toEqual([[]]);
    expect(await app.billing.listFinalizedYears(PROPERTY_ID)).toEqual([2024]);
    expect(app.renderer.rendered).toEqual(snapshots.map((s) => s.data));
    expect(app.unitOfWork.runs.at(-1)).toEqual({
      isolationLevel: "repeatable read",
    });
  });

  it("returns CONFLICT the second time and writes nothing more", async () => {
    const { app, caller } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });
    const before = storeState(app);

    expect(await codeOf(caller.reconciliation.finalize({ year: 2024 }))).toBe(
      "CONFLICT",
    );
    expect(storeState(app)).toEqual(before);
    expect(app.blob.puts).toHaveLength(3);
  });

  it("is rejected without a letter date and writes nothing", async () => {
    const { app, caller } = await setup();
    expect(await codeOf(caller.reconciliation.finalize({ year: 2024 }))).toBe(
      "BAD_REQUEST",
    );
    expect(app.billing.reconciliationYears.size).toBe(0);
    expect(app.billing.statementSnapshots.size).toBe(0);
    expect(app.blob.puts).toEqual([]);
  });

  it("is rejected before January 1", async () => {
    const { app, caller } = await setup("2024-12-31");
    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });
    await expect(
      caller.reconciliation.finalize({ year: 2024 }),
    ).rejects.toThrow("2024 can be finalized from January 1, 2025.");
    expect([...app.billing.reconciliationYears.values()][0]?.status).toBe(
      "draft",
    );
  });

  it("needs the previous year finalized first", async () => {
    const { caller } = await setup("2026-01-08");
    await caller.reconciliation.setLetterDate({
      year: 2025,
      letterDate: "2026-01-02",
    });
    await expect(
      caller.reconciliation.finalize({ year: 2025 }),
    ).rejects.toThrow("Finalize 2024 first.");

    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });
    await caller.reconciliation.finalize({ year: 2024 });
    const next = await caller.reconciliation.workspace({ year: 2025 });
    expect(next.gates.previousYearFinalized).toBe(true);
  });

  it("carries December's pools onto a January 1 renewal entered with no estimates", async () => {
    const { app, caller, ids } = await setupForFinalize();
    const tenantBId = ids.accountId(tenantB.accountId);
    const renewalId = randomUUID();
    editLeases(app, tenantBId, (leases) => {
      const [b1, b2] = leases;
      if (!b1 || !b2) throw new Error("missing lease");
      return [
        b1,
        { ...b2, endDate: "2024-12-31" },
        {
          id: renewalId,
          startDate: "2025-01-01",
          endDate: "2027-12-31",
          moveOutDate: null,
          lateFee: null,
          insuranceExpiresOn: "2025-06-30",
          rentSteps: [
            {
              id: randomUUID(),
              startsOn: "2025-01-01",
              amountCents: 330_000,
              tenantNotifiedAt: null,
            },
          ],
          estimateSteps: [],
        },
      ];
    });

    const workspace = await caller.reconciliation.workspace({ year: 2024 });
    expect(
      workspace.checklist
        .filter((item) => item.code === "estimate_carried_over")
        .map((item) => item.message),
    ).toEqual([
      "Tenant B Inc's lease from January 1, 2025 has no CAM estimate; finalize will add $229.79.",
      "Tenant B Inc's lease from January 1, 2025 has no Taxes estimate; finalize will add $597.90.",
      "Tenant B Inc's lease from January 1, 2025 has no Insurance estimate; finalize will add $112.01.",
      "Tenant B Inc's lease from January 1, 2025 has no Water estimate; finalize will add $72.00.",
    ]);
    expect(workspace.canFinalize).toBe(true);

    const result = await caller.reconciliation.finalize({ year: 2024 });
    expect(
      result.statements.find((s) => s.accountId === tenantBId),
    ).toMatchObject({ newMonthlyRentCents: 431_170, newEstimateSteps: 4 });
    expect(januarySteps(app, tenantBId)).toEqual([
      [],
      [],
      [7_200, 11_201, 22_979, 59_790],
    ]);
    const renewal = app.accounts.accounts
      .get(tenantBId)
      ?.leases.find((lease) => lease.id === renewalId);
    expect(renewal?.estimateSteps).toHaveLength(4);
    const after = await caller.reconciliation.workspace({ year: 2024 });
    expect(after.finalized?.mismatchCount).toBe(0);
  });

  it("replaces a January 1 step the owner already typed and keeps the step count", async () => {
    const { app, caller, ids } = await setupForFinalize();
    const superLuckyId = ids.accountId(superLucky.accountId);
    const camId = ids.poolId(POOLS.cam);
    const typedId = randomUUID();
    editLeases(app, superLuckyId, (leases) =>
      leases.map((lease) => ({
        ...lease,
        estimateSteps: [
          ...lease.estimateSteps,
          {
            id: typedId,
            poolId: camId,
            startsOn: "2025-01-01",
            amountCents: 30_000,
          },
        ],
      })),
    );

    const result = await caller.reconciliation.finalize({ year: 2024 });

    expect(
      result.statements.find((s) => s.accountId === superLuckyId),
    ).toMatchObject({ newEstimateSteps: 3 });
    const lease = app.accounts.accounts.get(superLuckyId)?.leases[0];
    expect(lease?.estimateSteps).toHaveLength(6);
    expect(
      lease?.estimateSteps.filter(
        (step) => step.poolId === camId && step.startsOn === "2025-01-01",
      ),
    ).toEqual([
      {
        id: typedId,
        poolId: camId,
        startsOn: "2025-01-01",
        amountCents: 28_724,
      },
    ]);
  });

  it("rejects a lease save from a page opened before finalize", async () => {
    const { caller, ids } = await setupForFinalize();
    const superLuckyId = ids.accountId(superLucky.accountId);
    const opened = await caller.account.get({ id: superLuckyId });
    const lease = opened.account.leases[0];
    if (!lease) throw new Error("missing lease");

    await caller.reconciliation.finalize({ year: 2024 });

    await expect(
      caller.lease.update({
        accountId: superLuckyId,
        expectedVersion: opened.account.version,
        leaseId: lease.id,
        lease: leaseInput({ startDate: "2023-01-01", endDate: "2027-12-31" }),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "This account changed since you opened it. Reload and try again.",
    });
    expect(
      (await caller.reconciliation.workspace({ year: 2024 })).finalized
        ?.mismatchCount,
    ).toBe(0);
  });

  it("is rejected while a checklist blocker stands", async () => {
    const { app, caller } = await setupForFinalize();
    app.billing.transactions.set("unsorted", {
      id: "unsorted",
      propertyId: PROPERTY_ID,
      source: "bank",
      importBatchId: "batch",
      postedOn: "2024-12-30",
      description: "UNKNOWN",
      descriptionKey: "unknown",
      amountCents: 1_000,
      externalId: null,
      lines: [],
    });
    const before = storeState(app);

    await expect(
      caller.reconciliation.finalize({ year: 2024 }),
    ).rejects.toThrow("1 transaction dated in 2024 still needs sorting.");
    expect(storeState(app)).toEqual(before);
  });

  it("leaves the stores unchanged when the renderer throws on the second account, and a retry overwrites the PDFs", async () => {
    const { app, caller } = await setupForFinalize();
    const before = storeState(app);
    app.renderer.failOnCall = 2;

    await expect(
      caller.reconciliation.finalize({ year: 2024 }),
    ).rejects.toThrow("Simulated render failure");

    expect(storeState(app)).toEqual(before);
    expect(app.billing.statementSnapshots.size).toBe(0);
    expect(app.billing.ledgerEntries.size).toBe(0);
    expect([...app.billing.reconciliationYears.values()][0]?.status).toBe(
      "draft",
    );
    expect(app.blob.puts).toHaveLength(1);

    await caller.reconciliation.finalize({ year: 2024 });
    expect(app.billing.statementSnapshots.size).toBe(3);
    expect(app.blob.puts).toHaveLength(4);
    expect(app.blob.objects.size).toBe(3);
    expect(app.blob.puts[1]).toBe(app.blob.puts[0]);
  });
});

describe("finalized workspace", () => {
  it("returns no finalized view for a draft year", async () => {
    const { caller } = await setupForFinalize();
    const result = await caller.reconciliation.workspace({ year: 2024 });
    expect(result.finalized).toBeNull();
  });

  it("shows the snapshots, mismatches after a payment is re-sorted, and the January table", async () => {
    const { app, caller, ids } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });
    const superLuckyId = ids.accountId(superLucky.accountId);

    const clean = await caller.reconciliation.workspace({ year: 2024 });
    expect(clean.status).toBe("finalized");
    expect(clean.finalized?.mismatchCount).toBe(0);
    expect(clean.finalized?.snapshots.map((s) => s.fileName)).toEqual([
      "2024 Reconciliation Super Lucky LLC A.pdf",
      "2024 Reconciliation Tenant B Inc B.pdf",
      "2024 Reconciliation Tenant D Co D.pdf",
    ]);
    expect(clean.finalized?.snapshots[0]?.data.trueUpCents).toBe(23_774);
    expect(clean.finalized?.snapshots[0]).not.toHaveProperty("pdfStorageKey");

    const december = [...app.billing.transactions.values()].find(
      (t) =>
        t.postedOn === "2024-12-01" && t.lines[0]?.accountId === superLuckyId,
    );
    if (!december) throw new Error("missing payment");
    await caller.transaction.unsort({ id: december.id });
    const repairs = [...app.billing.categories.values()].find(
      (c) => c.name === "Repairs",
    );
    if (!repairs) throw new Error("missing category");
    await caller.transaction.allocate({
      id: december.id,
      lines: [{ categoryId: repairs.id, amountCents: december.amountCents }],
    });
    app.billing.transactions.set("jan-1", {
      id: "jan-1",
      propertyId: PROPERTY_ID,
      source: "bank",
      importBatchId: "batch-2025",
      postedOn: "2025-01-02",
      description: "ACH DEP SUPER-LUCKY LLC",
      descriptionKey: "ach dep super-lucky llc",
      amountCents: 365_482,
      externalId: null,
      lines: [
        { accountId: superLuckyId, categoryId: null, amountCents: 365_482 },
      ],
    });

    const result = await caller.reconciliation.workspace({ year: 2024 });
    expect(result.finalized?.mismatchCount).toBe(1);
    const changed = result.finalized?.comparisons.find(
      (c) => c.accountId === superLuckyId,
    );
    expect(changed?.matches).toBe(false);
    expect(changed?.differences.map((d) => d.message)).toEqual([
      "Rent balance: $413.74, now $3,654.82 (+$3,241.08)",
      "Balance on account: $651.48, now $3,892.56 (+$3,241.08)",
    ]);
    expect(result.finalized?.january).toMatchObject({
      month: "2025-01",
      from: "2025-01-01",
      through: "2025-01-08",
    });
    expect(
      result.finalized?.january.rows.map((row) => [
        row.unitLabel,
        row.newMonthlyRentCents,
        row.paidCents,
        row.shortCents,
      ]),
    ).toEqual([
      ["A", 367_464, 365_482, 1_982],
      ["B", 416_170, 0, 416_170],
    ]);
  });
});

describe("finalized workspace after lease edits", () => {
  it("flags removed January 1 steps and a January 1 rent change against the snapshot", async () => {
    const { app, caller, ids } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });
    const superLuckyId = ids.accountId(superLucky.accountId);

    editLeases(app, superLuckyId, (leases) =>
      leases.map((lease) => ({
        ...lease,
        rentSteps: [
          ...lease.rentSteps,
          {
            id: randomUUID(),
            startsOn: "2025-01-01",
            amountCents: 260_000,
            tenantNotifiedAt: null,
          },
        ],
        estimateSteps: lease.estimateSteps.filter(
          (step) => step.startsOn !== "2025-01-01",
        ),
      })),
    );

    const result = await caller.reconciliation.workspace({ year: 2024 });
    expect(result.finalized?.mismatchCount).toBe(1);
    expect(
      result.finalized?.comparisons
        .find((c) => c.accountId === superLuckyId)
        ?.differences.map((d) => d.message),
    ).toEqual([
      "New CAM estimate: $287.24, now $268.61 (-$18.63)",
      "New Taxes estimate: $747.38, now $777.61 (+$30.23)",
      "New Insurance estimate: $140.02, now $108.60 (-$31.42)",
      "New monthly rent: $3,674.64, now $3,754.82 (+$80.18)",
    ]);
  });
});

describe("reconciliation.downloadUrl", () => {
  it("signs the stored PDF for one hour with its file name", async () => {
    const { app, caller, ids } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });
    const tenantBId = ids.accountId(tenantB.accountId);

    const result = await caller.reconciliation.downloadUrl({
      year: 2024,
      accountId: tenantBId,
    });

    const key = `reconciliations/${PROPERTY_ID}/2024/${tenantBId}.pdf`;
    expect(result).toEqual({
      url: `https://blob/${key}`,
      fileName: "2024 Reconciliation Tenant B Inc B.pdf",
      expiresInSeconds: 3600,
    });
    expect(app.blob.signed).toEqual([
      {
        key,
        options: {
          expiresInSeconds: 3600,
          fileName: "2024 Reconciliation Tenant B Inc B.pdf",
        },
      },
    ]);
  });

  it("is NOT_FOUND for another year and for another property's statement", async () => {
    const { app, caller, ids } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });
    const tenantBId = ids.accountId(tenantB.accountId);

    for (const year of [2023, 2025]) {
      expect(
        await codeOf(
          caller.reconciliation.downloadUrl({ year, accountId: tenantBId }),
        ),
      ).toBe("NOT_FOUND");
    }

    const stored = [...app.billing.statementSnapshots.values()][0];
    if (!stored) throw new Error("missing snapshot");
    const otherProperty = randomUUID();
    const otherAccount = randomUUID();
    app.billing.statementSnapshots.set("other-property", {
      ...stored,
      id: "other-property",
      propertyId: otherProperty,
      accountId: otherAccount,
      pdfStorageKey: `reconciliations/${otherProperty}/2024/${otherAccount}.pdf`,
    });
    expect(
      await codeOf(
        caller.reconciliation.downloadUrl({
          year: 2024,
          accountId: otherAccount,
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(app.blob.signed).toEqual([]);
  });

  it("is NOT_FOUND before finalize", async () => {
    const { caller, ids } = await setupForFinalize();
    expect(
      await codeOf(
        caller.reconciliation.downloadUrl({
          year: 2024,
          accountId: ids.accountId(tenantB.accountId),
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("after finalize", () => {
  it("dates a new adjustment inside the finalized year on the save day", async () => {
    const { app, caller, ids } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });

    const result = await caller.rent.addAdjustment({
      accountId: ids.accountId(superLucky.accountId),
      date: "2024-06-01",
      amountCents: 5_000,
      note: "Missed June charge",
    });

    expect(result.movedFrom).toBe("2024-06-01");
    expect(result.entry.entryDate).toBe("2025-01-08");
    expect(app.billing.finalizedYears).toEqual([]);
    const workspace = await caller.reconciliation.workspace({ year: 2024 });
    expect(workspace.finalized?.mismatchCount).toBe(0);
  });

  it("rejects removing an account that has a snapshot", async () => {
    const { app, caller, ids } = await setupForFinalize();
    await caller.reconciliation.finalize({ year: 2024 });
    const tenantDId = ids.accountId(tenantD.accountId);
    for (const txn of [...app.billing.transactions.values()]) {
      if (txn.lines.some((line) => line.accountId === tenantDId)) {
        app.billing.transactions.delete(txn.id);
      }
    }
    for (const entry of [...app.billing.ledgerEntries.values()]) {
      if (entry.accountId === tenantDId)
        app.billing.ledgerEntries.delete(entry.id);
    }

    expect(await codeOf(caller.account.remove({ id: tenantDId }))).toBe(
      "CONFLICT",
    );
  });
});
