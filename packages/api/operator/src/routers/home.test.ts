import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeaseInput } from "../schemas";
import type { TestCaller } from "../test-setup-stores";
import {
  codeOf,
  createTestApp,
  leaseInput,
  PLATFORM_ADMIN,
  PROPERTY_ID,
  STRANGER,
  TEST_ADDRESS,
  versionOf,
} from "../test-setup-stores";

function useToday(date: string) {
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("TODAY_OVERRIDE", date);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

type App = ReturnType<typeof createTestApp>;

function addTransaction(
  app: App,
  postedOn: string,
  amountCents: number,
  accountId: string | null,
) {
  const id = randomUUID();
  app.billing.transactions.set(id, {
    id,
    propertyId: PROPERTY_ID,
    source: "bank",
    importBatchId: "batch",
    postedOn,
    description: `DEPOSIT ${postedOn}`,
    descriptionKey: "deposit",
    amountCents,
    externalId: null,
    lines: accountId ? [{ accountId, categoryId: null, amountCents }] : [],
  });
}

function lease(
  startDate: string,
  endDate: string,
  options: {
    steps?: [string, number][];
    insuranceExpiresOn?: string | null;
    moveOutDate?: string | null;
  } = {},
): LeaseInput {
  return {
    ...leaseInput({ startDate, endDate, moveOutDate: options.moveOutDate }),
    rentSteps: (options.steps ?? [[startDate, 200_000]]).map(
      ([startsOn, amountCents]) => ({ startsOn, amountCents }),
    ),
    insuranceExpiresOn:
      options.insuranceExpiresOn === undefined
        ? "2027-06-30"
        : options.insuranceExpiresOn,
  };
}

async function openAccount(
  caller: TestCaller,
  label: string,
  input: LeaseInput,
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
    lease: input,
  });
  return opened.account;
}

describe("home.comingUp needs property mode and membership", () => {
  it("rejects platform mode", async () => {
    const caller = await createTestApp().callerFor(PLATFORM_ADMIN, "platform");
    expect(await codeOf(caller.home.comingUp())).toBe("FORBIDDEN");
  });

  it("rejects a non-member", async () => {
    const caller = await createTestApp().callerFor(STRANGER);
    expect(await codeOf(caller.home.comingUp())).toBe("FORBIDDEN");
  });
});

describe("home.comingUp", () => {
  it("lists items just inside each window and leaves out those just outside", async () => {
    useToday("2026-10-05");
    const app = createTestApp();
    const caller = await app.callerFor();
    const a = await openAccount(
      caller,
      "A",
      lease("2026-01-01", "2027-01-03", {
        steps: [
          ["2026-01-01", 250_000],
          ["2026-10-04", 255_000],
          ["2027-01-03", 260_000],
        ],
      }),
    );
    await openAccount(
      caller,
      "B",
      lease("2026-01-01", "2027-01-04", {
        steps: [
          ["2026-01-01", 200_000],
          ["2027-01-04", 210_000],
        ],
        insuranceExpiresOn: "2026-12-04",
      }),
    );
    await openAccount(
      caller,
      "C",
      lease("2026-01-01", "2026-10-04", { insuranceExpiresOn: "2026-12-05" }),
    );
    await openAccount(
      caller,
      "D",
      lease("2026-12-04", "2027-12-03", { insuranceExpiresOn: null }),
    );
    await openAccount(
      caller,
      "E",
      lease("2026-12-05", "2027-12-04", { insuranceExpiresOn: null }),
    );
    await openAccount(
      caller,
      "F",
      lease("2025-10-05", "2026-10-05", { insuranceExpiresOn: "2026-10-04" }),
    );
    await openAccount(
      caller,
      "G",
      lease("2026-01-01", "2026-12-31", {
        moveOutDate: "2026-09-30",
        insuranceExpiresOn: null,
      }),
    );

    const result = await caller.home.comingUp();

    expect(result.today).toBe("2026-10-05");
    const firstLease = a.leases[0];
    const step = firstLease?.rentSteps.find((s) => s.startsOn === "2027-01-03");
    if (!firstLease || !step) throw new Error("missing step");
    expect(result.rentChanges).toEqual([
      {
        accountId: a.id,
        leaseId: firstLease.id,
        stepId: step.id,
        startsOn: "2027-01-03",
        amountCents: 260_000,
        previousAmountCents: 255_000,
        tenantNotifiedAt: null,
        tenant: { id: a.tenant.id, businessName: "Tenant A" },
        unit: { id: a.unit.id, label: "A" },
        accountVersion: a.version,
      },
    ]);
    expect(
      result.insurance.map((item) => [
        item.unit.label,
        item.insuranceExpiresOn,
        item.problem,
      ]),
    ).toEqual([
      ["D", null, "missing"],
      ["F", "2026-10-04", "expired"],
      ["B", "2026-12-04", "expiring"],
    ]);
    expect(
      result.leasesEnding.map((item) => [item.unit.label, item.endDate]),
    ).toEqual([
      ["F", "2026-10-05"],
      ["A", "2027-01-03"],
    ]);
    expect(
      result.pastEndDate.map((item) => [item.unit.label, item.endDate]),
    ).toEqual([["C", "2026-10-04"]]);

    await caller.lease.setRentStepNotified({
      accountId: a.id,
      expectedVersion: await versionOf(caller, a.id),
      leaseId: firstLease.id,
      stepId: step.id,
      notified: true,
    });
    const notified = await caller.home.comingUp();
    expect(notified.rentChanges[0]?.tenantNotifiedAt).toBeInstanceOf(Date);
  });

  it("lists every account with a late fee to decide and counts transactions to sort, writing nothing", async () => {
    useToday("2026-10-12");
    const app = createTestApp();
    const caller = await app.callerFor();
    const short = await openAccount(
      caller,
      "A",
      lease("2026-01-01", "2027-12-31"),
    );
    const oldBalance = await openAccount(
      caller,
      "B",
      lease("2026-01-01", "2027-12-31"),
    );
    const paid = await openAccount(
      caller,
      "C",
      lease("2026-01-01", "2027-12-31"),
    );
    const caughtUp = await openAccount(
      caller,
      "D",
      lease("2026-01-01", "2027-12-31"),
    );
    for (const month of [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
    ]) {
      addTransaction(app, `2026-${month}-01`, 200_000, short.id);
      addTransaction(app, `2026-${month}-01`, 200_000, paid.id);
      addTransaction(app, `2026-${month}-01`, 200_000, caughtUp.id);
      if (month !== "09") {
        addTransaction(app, `2026-${month}-01`, 200_000, oldBalance.id);
      }
    }
    addTransaction(app, "2026-10-02", 150_000, short.id);
    addTransaction(app, "2026-10-02", 200_000, oldBalance.id);
    addTransaction(app, "2026-10-02", 200_000, paid.id);
    addTransaction(app, "2026-10-11", 200_000, caughtUp.id);
    addTransaction(app, "2026-10-03", 9_999, null);
    addTransaction(app, "2026-10-04", -4_500, null);
    const before = {
      transactions: structuredClone(app.billing.transactions),
      entries: structuredClone(app.billing.ledgerEntries),
    };

    const result = await caller.home.comingUp();

    expect(app.billing.transactions).toEqual(before.transactions);
    expect(app.billing.ledgerEntries).toEqual(before.entries);
    expect(result.toSortCount).toBe(2);
    expect(result.timeZone).toBe("America/Chicago");
    expect(
      result.lateFees.map((item) => [
        item.unit.label,
        item.tenant.businessName,
        item.suggestions.map((s) => [s.accountId, s.month, s.amountCents]),
      ]),
    ).toEqual([
      ["A", "Tenant A", [[short.id, "2026-10", 5_000]]],
      ["D", "Tenant D", [[caughtUp.id, "2026-10", 5_000]]],
    ]);
  });

  it("leaves out late fees until bank data reaches the fee day", async () => {
    useToday("2026-10-12");
    const app = createTestApp();
    const caller = await app.callerFor();
    const unpaid = await openAccount(
      caller,
      "A",
      lease("2026-01-01", "2027-12-31"),
    );
    for (const month of ["01", "02", "03", "04", "05", "06", "07", "08"]) {
      addTransaction(app, `2026-${month}-01`, 200_000, unpaid.id);
    }
    addTransaction(app, "2026-09-01", 200_000, unpaid.id);
    addTransaction(app, "2026-10-09", -4_500, null);

    const waiting = await caller.home.comingUp();
    expect(waiting.lateFees).toEqual([]);

    addTransaction(app, "2026-10-10", -4_500, null);
    const ready = await caller.home.comingUp();
    expect(
      ready.lateFees.map((item) =>
        item.suggestions.map((s) => [s.accountId, s.month]),
      ),
    ).toEqual([[[unpaid.id, "2026-10"]]]);
  });

  it("sums rent by month over every account, including closed ones, and flags months without bank data", async () => {
    useToday("2026-10-12");
    const app = createTestApp();
    const caller = await app.callerFor();
    const staying = await openAccount(
      caller,
      "A",
      lease("2026-01-01", "2027-12-31"),
    );
    const movedOut = await openAccount(
      caller,
      "B",
      lease("2026-01-01", "2026-12-31", {
        steps: [["2026-01-01", 100_000]],
        moveOutDate: "2026-03-31",
      }),
    );
    for (const month of ["01", "02", "03"]) {
      addTransaction(app, `2026-${month}-01`, 100_000, movedOut.id);
    }
    for (const month of ["01", "02", "03", "04", "05", "06", "07", "08"]) {
      addTransaction(app, `2026-${month}-01`, 200_000, staying.id);
    }
    addTransaction(app, "2026-09-03", 150_000, staying.id);

    const result = await caller.home.comingUp();

    expect(result.accountCount).toBe(2);
    expect(
      result.rentMonths.map((m) => [
        m.month,
        m.expectedCents,
        m.paidCents,
        m.nodata,
      ]),
    ).toEqual([
      [1, 300_000, 300_000, false],
      [2, 300_000, 300_000, false],
      [3, 300_000, 300_000, false],
      [4, 200_000, 200_000, false],
      [5, 200_000, 200_000, false],
      [6, 200_000, 200_000, false],
      [7, 200_000, 200_000, false],
      [8, 200_000, 200_000, false],
      [9, 200_000, 150_000, false],
      [10, 200_000, 0, true],
      [11, 200_000, 0, false],
      [12, 200_000, 0, false],
    ]);
  });
});
