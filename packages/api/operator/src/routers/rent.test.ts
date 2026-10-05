import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LedgerEntry } from "@moonship/billing";

import type { TestCaller } from "../test-setup-stores";
import {
  codeOf,
  createTestApp,
  leaseInput,
  PLATFORM_ADMIN,
  PROPERTY_ID,
  STRANGER,
  TEST_ADDRESS,
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

function pay(
  app: App,
  accountId: string,
  postedOn: string,
  amountCents: number,
  source: "bank" | "cash" = "bank",
) {
  const id = randomUUID();
  app.billing.transactions.set(id, {
    id,
    propertyId: PROPERTY_ID,
    source,
    importBatchId: source === "bank" ? "batch" : null,
    postedOn,
    description: `DEPOSIT ${postedOn}`,
    descriptionKey: "deposit",
    amountCents,
    externalId: null,
    lines: [{ accountId, categoryId: null, amountCents }],
  });
}

function addEntry(
  app: App,
  accountId: string,
  overrides: Partial<LedgerEntry>,
): LedgerEntry {
  const entry: LedgerEntry = {
    id: randomUUID(),
    propertyId: PROPERTY_ID,
    accountId,
    kind: "adjustment",
    entryDate: "2026-02-10",
    amountCents: 1_000,
    note: "Charge",
    feeMonth: null,
    reconciliationYearId: null,
    ...overrides,
  };
  app.billing.ledgerEntries.set(entry.id, entry);
  return entry;
}

async function openAccount(
  caller: TestCaller,
  label: string,
  lease: Parameters<typeof leaseInput>[0] = {},
) {
  const unit = await caller.unit.create({
    label,
    sqft: 1000,
    address: TEST_ADDRESS,
  });
  const tenant = await caller.tenant.create({
    businessName: `Tenant ${label}`,
  });
  if (!tenant) throw new Error("missing tenant");
  const opened = await caller.account.open({
    tenantId: tenant.id,
    unitId: unit.id,
    openingBalanceCents: 0,
    lease: leaseInput(lease),
  });
  return opened.account.id;
}

async function setup() {
  const app = createTestApp();
  const caller = await app.callerFor();
  const pools = await caller.pool.list();
  const cam = pools.find((p) => p.name === "CAM");
  if (!cam) throw new Error("missing CAM pool");
  const paid = await openAccount(caller, "A", { rentCents: 250_000 });
  const behind = await openAccount(caller, "D", {
    rentCents: 200_000,
    estimates: [
      { poolId: cam.id, startsOn: "2026-01-01", amountCents: 16_000 },
    ],
  });
  const due = await openAccount(caller, "E", { rentCents: 150_000 });
  const closedOwing = await openAccount(caller, "B", {
    rentCents: 100_000,
    moveOutDate: "2026-01-31",
  });
  const closedPaid = await openAccount(caller, "C", {
    rentCents: 100_000,
    moveOutDate: "2026-01-31",
  });
  const upcoming = await openAccount(caller, "F", {
    startDate: "2026-04-01",
    rentCents: 100_000,
  });
  const credit = await openAccount(caller, "G", { rentCents: 100_000 });

  for (const month of ["01", "02", "03"]) {
    pay(app, paid, `2026-${month}-01`, 250_000);
    pay(app, credit, `2026-${month}-01`, 100_000);
  }
  pay(app, credit, "2026-03-02", 40_000, "cash");
  pay(app, behind, "2026-01-02", 216_000);
  pay(app, due, "2026-01-01", 150_000);
  pay(app, due, "2026-02-01", 150_000);
  pay(app, closedPaid, "2026-01-01", 100_000);
  pay(app, upcoming, "2026-03-01", 50_000);

  return {
    app,
    caller,
    cam,
    ids: { paid, behind, due, closedOwing, closedPaid, upcoming, credit },
  };
}

describe("rent procedures need property mode and membership", () => {
  const calls: [string, (caller: TestCaller) => Promise<unknown>][] = [
    ["rent.status", (c) => c.rent.status()],
    ["rent.history", (c) => c.rent.history({ accountId: ID })],
    [
      "rent.addAdjustment",
      (c) =>
        c.rent.addAdjustment({
          accountId: ID,
          date: "2026-02-01",
          amountCents: 100,
          note: "x",
        }),
    ],
    [
      "rent.updateAdjustment",
      (c) =>
        c.rent.updateAdjustment({
          id: ID,
          date: "2026-02-01",
          amountCents: 100,
          note: "x",
        }),
    ],
    ["rent.removeEntry", (c) => c.rent.removeEntry({ id: ID })],
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

describe("rent.status", () => {
  beforeEach(() => useToday("2026-03-05"));

  it("lists open accounts and closed accounts that owe, Behind first, and writes nothing", async () => {
    const { app, caller, ids } = await setup();
    const before = {
      transactions: structuredClone(app.billing.transactions),
      entries: structuredClone(app.billing.ledgerEntries),
    };

    const result = await caller.rent.status();

    expect(app.billing.transactions).toEqual(before.transactions);
    expect(app.billing.ledgerEntries).toEqual(before.entries);
    expect(result.today).toBe("2026-03-05");
    expect(result.trackingStart).toBe("2026-01-01");
    expect(result.newestBankDate).toBe("2026-03-01");
    expect(
      result.rows.map((row) => [row.unit.label, row.status, row.balanceCents]),
    ).toEqual([
      ["D", "behind", 432_000],
      ["B", "behind", 100_000],
      ["E", "due", 150_000],
      ["A", "paid", 0],
      ["G", "credit", -40_000],
    ]);
    const behind = result.rows.find((row) => row.accountId === ids.behind);
    expect(behind).toMatchObject({
      tenant: { businessName: "Tenant D" },
      state: "open",
      expectedCents: 648_000,
      receivedCents: 216_000,
      balanceCents: 432_000,
      lastPaymentOn: "2026-01-02",
    });
    const closed = result.rows.find((row) => row.accountId === ids.closedOwing);
    expect(closed?.state).toBe("closed");
    expect(closed?.lastPaymentOn).toBeNull();
  });

  it("turns Due into Behind the day after the late-fee day", async () => {
    const { caller, ids } = await setup();
    useToday("2026-03-11");
    const result = await caller.rent.status();
    expect(result.rows.find((row) => row.accountId === ids.due)?.status).toBe(
      "behind",
    );
  });
});

describe("rent.history", () => {
  beforeEach(() => useToday("2026-03-05"));

  it("lists what makes up the balance, through today, with a running balance", async () => {
    const { app, caller, ids } = await setup();
    addEntry(app, ids.behind, { entryDate: "2026-02-10", amountCents: 5_000 });
    addEntry(app, ids.behind, { entryDate: "2026-03-20", amountCents: 7_000 });

    const history = await caller.rent.history({ accountId: ids.behind });

    expect(history.account).toMatchObject({
      id: ids.behind,
      unit: { label: "D" },
      state: "open",
      openingBalanceCents: 0,
    });
    expect(history.status).toBe("behind");
    expect(history.balanceCents).toBe(437_000);
    expect(
      history.rows.map((row) => [
        row.kind,
        row.date,
        row.amountCents,
        row.balanceCents,
      ]),
    ).toEqual([
      ["opening", "2025-12-31", 0, 0],
      ["month", "2026-01-01", 216_000, 216_000],
      ["payment", "2026-01-02", -216_000, 0],
      ["month", "2026-02-01", 216_000, 216_000],
      ["adjustment", "2026-02-10", 5_000, 221_000],
      ["month", "2026-03-01", 216_000, 437_000],
    ]);
    const month = history.rows[1];
    expect(month?.kind === "month" ? month.estimates : []).toEqual([
      expect.objectContaining({ poolName: "CAM", amountCents: 16_000 }),
    ]);
  });

  it("rejects an account from another property", async () => {
    const { caller } = await setup();
    expect(await codeOf(caller.rent.history({ accountId: ID }))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("adjustments", () => {
  beforeEach(() => useToday("2026-03-05"));

  it("adds a credit or charge with a note and counts it in the balance", async () => {
    const { app, caller, ids } = await setup();

    const charge = await caller.rent.addAdjustment({
      accountId: ids.paid,
      date: "2026-03-02",
      amountCents: 2_500,
      note: "  Key replacement ",
    });
    await caller.rent.addAdjustment({
      accountId: ids.paid,
      date: "2026-02-15",
      amountCents: -1_000,
      note: "Credit for a broken door",
    });

    expect(charge.movedFrom).toBeNull();
    expect(charge.entry).toMatchObject({
      kind: "adjustment",
      entryDate: "2026-03-02",
      amountCents: 2_500,
      note: "Key replacement",
    });
    expect(app.billing.ledgerEntries.size).toBe(2);
    const row = (await caller.rent.status()).rows.find(
      (r) => r.accountId === ids.paid,
    );
    expect(row).toMatchObject({ balanceCents: 1_500, status: "due" });
  });

  it("rejects a bad date, a zero amount, an empty note, and an unknown account", async () => {
    const { caller, ids } = await setup();
    const base = {
      accountId: ids.paid,
      date: "2026-03-01",
      amountCents: 100,
      note: "Note",
    };
    expect(
      await codeOf(caller.rent.addAdjustment({ ...base, date: "2025-12-31" })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(caller.rent.addAdjustment({ ...base, date: "2026-03-06" })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(caller.rent.addAdjustment({ ...base, amountCents: 0 })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(caller.rent.addAdjustment({ ...base, note: "   " })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(caller.rent.addAdjustment({ ...base, accountId: ID })),
    ).toBe("NOT_FOUND");
  });

  it("saves an adjustment dated in a finalized year with today's date", async () => {
    const app = createTestApp({ trackingStartDate: "2025-01-01" });
    const caller = await app.callerFor();
    useToday("2026-01-12");
    const accountId = await openAccount(caller, "A", {
      startDate: "2025-01-01",
      endDate: "2027-12-31",
    });
    app.billing.finalizedYears = [2025];

    const result = await caller.rent.addAdjustment({
      accountId,
      date: "2025-12-20",
      amountCents: 3_000,
      note: "Missed December fee",
    });

    expect(result.movedFrom).toBe("2025-12-20");
    expect(result.entry.entryDate).toBe("2026-01-12");
    expect(app.billing.ledgerEntries.get(result.entry.id)?.entryDate).toBe(
      "2026-01-12",
    );
  });

  it("updates an adjustment and rejects other kinds and finalized years", async () => {
    const { app, caller, ids } = await setup();
    const entry = addEntry(app, ids.paid, {});

    const updated = await caller.rent.updateAdjustment({
      id: entry.id,
      date: "2026-03-01",
      amountCents: -4_000,
      note: "Credit",
    });
    expect(updated).toMatchObject({
      id: entry.id,
      entryDate: "2026-03-01",
      amountCents: -4_000,
      note: "Credit",
    });

    const fee = addEntry(app, ids.paid, {
      kind: "late_fee",
      note: null,
      feeMonth: "2026-02",
      amountCents: 5_000,
      entryDate: "2026-02-11",
    });
    const input = { date: "2026-03-01", amountCents: 100, note: "x" };
    expect(
      await codeOf(caller.rent.updateAdjustment({ id: fee.id, ...input })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(caller.rent.updateAdjustment({ id: ID, ...input })),
    ).toBe("NOT_FOUND");

    const old = addEntry(app, ids.paid, { entryDate: "2025-12-31" });
    app.billing.finalizedYears = [2025];
    expect(
      await codeOf(caller.rent.updateAdjustment({ id: old.id, ...input })),
    ).toBe("CONFLICT");
    expect(app.billing.ledgerEntries.get(old.id)?.entryDate).toBe("2025-12-31");
  });

  it("removes an entry but not a true-up or one in a finalized year", async () => {
    const { app, caller, ids } = await setup();
    const entry = addEntry(app, ids.paid, {});
    const fee = addEntry(app, ids.paid, {
      kind: "late_fee_dismissed",
      note: null,
      feeMonth: "2026-02",
      amountCents: 0,
    });
    const trueUp = addEntry(app, ids.paid, {
      kind: "true_up",
      note: null,
      reconciliationYearId: randomUUID(),
      entryDate: "2026-01-01",
    });
    const old = addEntry(app, ids.paid, { entryDate: "2025-12-31" });
    app.billing.finalizedYears = [2025];

    expect(await caller.rent.removeEntry({ id: entry.id })).toEqual({
      ok: true,
    });
    expect(await caller.rent.removeEntry({ id: fee.id })).toEqual({ ok: true });
    expect(await codeOf(caller.rent.removeEntry({ id: trueUp.id }))).toBe(
      "CONFLICT",
    );
    expect(await codeOf(caller.rent.removeEntry({ id: old.id }))).toBe(
      "CONFLICT",
    );
    expect([...app.billing.ledgerEntries.keys()].sort()).toEqual(
      [trueUp.id, old.id].sort(),
    );
  });

  it("blocks deleting an account and changing the tracking start once an entry exists", async () => {
    const { app, caller, ids } = await setup();
    const accountId = await openAccount(caller, "H");
    await caller.rent.addAdjustment({
      accountId,
      date: "2026-03-01",
      amountCents: 100,
      note: "Charge",
    });

    expect(await codeOf(caller.account.remove({ id: accountId }))).toBe(
      "CONFLICT",
    );
    app.billing.transactions.clear();
    expect(await app.billing.accountHasActivity(PROPERTY_ID, ids.paid)).toBe(
      false,
    );
    expect(
      await codeOf(caller.property.update({ trackingStartDate: "2026-02-01" })),
    ).toBe("CONFLICT");
  });
});
