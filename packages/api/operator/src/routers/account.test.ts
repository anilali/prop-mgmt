import { describe, expect, it, vi } from "vitest";

import { StaleAccountError } from "@moonship/lease-mgmt";

import {
  codeOf,
  createTestApp,
  leaseInput,
  TEST_ADDRESS,
  versionOf,
} from "../test-setup-stores";

async function setup(options: { trackingStartDate?: string | null } = {}) {
  const app = createTestApp(options);
  const caller = await app.callerFor();
  const a = await caller.unit.create({
    label: "A",
    sqft: 2500,
    address: TEST_ADDRESS,
  });
  const b = await caller.unit.create({
    label: "B",
    sqft: 2000,
    address: TEST_ADDRESS,
  });
  const tenant = await caller.tenant.create({
    businessName: "Super Lucky LLC",
  });
  const other = await caller.tenant.create({ businessName: "Tenant D" });
  if (!tenant || !other) throw new Error("missing tenant");
  const pools = await caller.pool.list();
  const poolId = (name: string) => {
    const pool = pools.find((p) => p.name === name);
    if (!pool) throw new Error(`missing pool ${name}`);
    return pool.id;
  };
  return {
    app,
    caller,
    a,
    b,
    tenantId: tenant.id,
    otherTenantId: other.id,
    poolId,
  };
}

describe("account procedures", () => {
  it("opens an account with a lease, steps, estimates, and a late fee", async () => {
    const { caller, a, tenantId, poolId } = await setup();

    const detail = await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 41_374,
      lease: {
        startDate: "2023-01-01",
        endDate: "2027-12-31",
        rentSteps: [
          { startsOn: "2023-01-01", amountCents: 250_000 },
          { startsOn: "2026-07-01", amountCents: 260_000 },
        ],
        estimates: [
          {
            poolId: poolId("CAM"),
            steps: [{ startsOn: "2023-01-01", amountCents: 26_861 }],
          },
        ],
        lateFee: { amountCents: 5000, day: 10 },
        insuranceExpiresOn: "2026-11-30",
      },
    });

    expect(detail.account.tenant.businessName).toBe("Super Lucky LLC");
    expect(detail.account.unit.label).toBe("A");
    expect(detail.account.openingBalanceCents).toBe(41_374);
    expect(detail.account.startDate).toBe("2023-01-01");
    expect(detail.account.endDate).toBeNull();
    expect(detail.account.leases[0]?.rentSteps).toHaveLength(2);
    expect(detail.account.leases[0]?.lateFee).toEqual({
      amountCents: 5000,
      day: 10,
    });
    expect(detail.unitPools.map((p) => p.name)).toEqual([
      "CAM",
      "Taxes",
      "Insurance",
    ]);
    expect(detail.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const list = await caller.account.list();
    expect(list.accounts.map((acc) => acc.id)).toEqual([detail.account.id]);
  });

  it("reports the account state from today", async () => {
    const { caller, a, b, tenantId } = await setup();
    await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2020-01-01", endDate: "2020-12-31" }),
    });
    await caller.account.open({
      tenantId,
      unitId: b.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2099-01-01", endDate: "2099-12-31" }),
    });

    const { accounts } = await caller.account.list();

    expect(accounts.map((acc) => [acc.unit.label, acc.state])).toEqual([
      ["A", "holdover"],
      ["B", "upcoming"],
    ]);
  });

  it("rejects overlapping accounts on one unit", async () => {
    const { caller, a, tenantId, otherTenantId } = await setup();
    await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2024-01-01", endDate: "2024-12-31" }),
    });

    expect(
      await codeOf(
        caller.account.open({
          tenantId: otherTenantId,
          unitId: a.id,
          openingBalanceCents: 0,
          lease: leaseInput({ startDate: "2026-01-01", endDate: "2026-12-31" }),
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("allows a new account on a unit after the old account's move-out", async () => {
    const { caller, a, tenantId, otherTenantId } = await setup();
    await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput({
        startDate: "2024-01-01",
        endDate: "2026-12-31",
        moveOutDate: "2026-03-31",
      }),
    });

    const next = await caller.account.open({
      tenantId: otherTenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2026-04-01", endDate: "2027-03-31" }),
    });

    expect(next.account.startDate).toBe("2026-04-01");
  });

  it("lets one tenant hold accounts on two units", async () => {
    const { caller, a, b, tenantId } = await setup();

    await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput(),
    });
    await caller.account.open({
      tenantId,
      unitId: b.id,
      openingBalanceCents: 0,
      lease: leaseInput(),
    });

    const { accounts } = await caller.account.list();
    expect(accounts.map((acc) => [acc.tenant.id, acc.unit.label])).toEqual([
      [tenantId, "A"],
      [tenantId, "B"],
    ]);
  });

  it("rejects a pool the unit is not in", async () => {
    const { caller, a, tenantId, poolId } = await setup();

    expect(
      await codeOf(
        caller.account.open({
          tenantId,
          unitId: a.id,
          openingBalanceCents: 0,
          lease: leaseInput({
            estimates: [
              {
                poolId: poolId("Water"),
                startsOn: "2026-01-01",
                amountCents: 1,
              },
            ],
          }),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects a non-zero opening balance on an account starting after tracking start", async () => {
    const { caller, a, tenantId } = await setup();

    expect(
      await codeOf(
        caller.account.open({
          tenantId,
          unitId: a.id,
          openingBalanceCents: 10_000,
          lease: leaseInput({ startDate: "2026-02-01" }),
        }),
      ),
    ).toBe("BAD_REQUEST");

    const opened = await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 10_000,
      lease: leaseInput({ startDate: "2026-01-01" }),
    });
    expect(opened.account.openingBalanceCents).toBe(10_000);
  });

  it("rejects a non-zero opening balance while the tracking start is not set", async () => {
    const { caller, a, tenantId } = await setup({ trackingStartDate: null });

    expect(
      await codeOf(
        caller.account.open({
          tenantId,
          unitId: a.id,
          openingBalanceCents: 10_000,
          lease: leaseInput(),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("setOpeningBalance applies the same rule", async () => {
    const { caller, a, tenantId } = await setup();
    const opened = await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2026-03-01" }),
    });

    expect(
      await codeOf(
        caller.account.setOpeningBalance({
          id: opened.account.id,
          expectedVersion: await versionOf(caller, opened.account.id),
          openingBalanceCents: -500,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects an archived tenant and an unknown unit", async () => {
    const { caller, a, tenantId } = await setup();
    await caller.tenant.archive({ id: tenantId });

    expect(
      await codeOf(
        caller.account.open({
          tenantId,
          unitId: a.id,
          openingBalanceCents: 0,
          lease: leaseInput(),
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.account.open({
          tenantId,
          unitId: "44444444-4444-4444-8444-444444444444",
          openingBalanceCents: 0,
          lease: leaseInput(),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("remove deletes an account with no activity and rejects one with activity", async () => {
    const { app, caller, a, b, tenantId } = await setup();
    const first = await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput(),
    });
    const second = await caller.account.open({
      tenantId,
      unitId: b.id,
      openingBalanceCents: 0,
      lease: leaseInput(),
    });
    app.billing.accountIdsWithActivity.add(second.account.id);

    expect(await caller.account.remove({ id: first.account.id })).toEqual({
      ok: true,
    });
    expect(await codeOf(caller.account.remove({ id: second.account.id }))).toBe(
      "CONFLICT",
    );
  });
});

describe("lease procedures", () => {
  async function openOnA() {
    const ctx = await setup();
    const opened = await ctx.caller.account.open({
      tenantId: ctx.tenantId,
      unitId: ctx.a.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2025-01-01", endDate: "2025-12-31" }),
    });
    return { ...ctx, accountId: opened.account.id, opened };
  }

  it("rejects a save from a stale copy of the account", async () => {
    const { app, caller, accountId, opened } = await openOnA();
    const stale = opened.account.version;
    const lease = opened.account.leases[0];
    const step = lease?.rentSteps[0];
    if (!lease || !step) throw new Error("missing lease");

    const added = await caller.lease.add({
      accountId,
      expectedVersion: stale,
      lease: leaseInput({ startDate: "2026-01-01", endDate: "2026-12-31" }),
    });
    expect(added.account.version).toBe(stale + 1);

    const calls = [
      () =>
        caller.lease.add({
          accountId,
          expectedVersion: stale,
          lease: leaseInput({ startDate: "2027-01-01", endDate: "2027-12-31" }),
        }),
      () =>
        caller.lease.update({
          accountId,
          expectedVersion: stale,
          leaseId: lease.id,
          lease: leaseInput({ startDate: "2025-01-01", endDate: "2025-12-31" }),
        }),
      () =>
        caller.lease.remove({
          accountId,
          expectedVersion: stale,
          leaseId: lease.id,
        }),
      () =>
        caller.lease.setRentStepNotified({
          accountId,
          expectedVersion: stale,
          leaseId: lease.id,
          stepId: step.id,
          notified: true,
        }),
      () =>
        caller.account.setOpeningBalance({
          id: accountId,
          expectedVersion: stale,
          openingBalanceCents: 0,
        }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({
        code: "CONFLICT",
        message:
          "This account changed since you opened it. Reload and try again.",
      });
    }
    expect((await caller.account.get({ id: accountId })).account).toMatchObject(
      { version: stale + 1 },
    );
    expect(
      (await caller.account.get({ id: accountId })).account.leases,
    ).toHaveLength(2);

    vi.spyOn(app.accounts, "save").mockRejectedValueOnce(
      new StaleAccountError(),
    );
    expect(
      await codeOf(
        caller.account.setOpeningBalance({
          id: accountId,
          expectedVersion: stale + 1,
          openingBalanceCents: 0,
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("adds a renewal on the same account", async () => {
    const { caller, accountId } = await openOnA();

    const detail = await caller.lease.add({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      lease: leaseInput({ startDate: "2026-01-01", endDate: "2026-12-31" }),
    });

    expect(detail.account.leases.map((l) => l.startDate)).toEqual([
      "2025-01-01",
      "2026-01-01",
    ]);
  });

  it("rejects overlapping leases on one account", async () => {
    const { caller, accountId } = await openOnA();

    expect(
      await codeOf(
        caller.lease.add({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          lease: leaseInput({ startDate: "2025-12-01", endDate: "2026-11-30" }),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects a lease after a lease with a move-out date", async () => {
    const { caller, accountId, opened } = await openOnA();
    const leaseId = opened.account.leases[0]?.id;
    if (!leaseId) throw new Error("missing lease");
    await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId,
      lease: leaseInput({
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        moveOutDate: "2025-10-31",
      }),
    });

    expect(
      await codeOf(
        caller.lease.add({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          lease: leaseInput({ startDate: "2026-01-01", endDate: "2026-12-31" }),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("rejects an update that makes the account overlap another on the unit", async () => {
    const { caller, accountId, opened, otherTenantId, a } = await openOnA();
    const leaseId = opened.account.leases[0]?.id;
    if (!leaseId) throw new Error("missing lease");
    await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId,
      lease: leaseInput({
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        moveOutDate: "2025-12-31",
      }),
    });
    await caller.account.open({
      tenantId: otherTenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2026-01-01" }),
    });

    expect(
      await codeOf(
        caller.lease.update({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          leaseId,
          lease: leaseInput({ startDate: "2025-01-01", endDate: "2025-12-31" }),
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("removes a lease only when another remains", async () => {
    const { caller, accountId, opened } = await openOnA();
    const firstId = opened.account.leases[0]?.id;
    if (!firstId) throw new Error("missing lease");

    expect(
      await codeOf(
        caller.lease.remove({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          leaseId: firstId,
        }),
      ),
    ).toBe("BAD_REQUEST");

    await caller.lease.add({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      lease: leaseInput({ startDate: "2026-01-01", endDate: "2026-12-31" }),
    });
    const detail = await caller.lease.remove({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: firstId,
    });
    expect(detail.account.leases.map((l) => l.startDate)).toEqual([
      "2026-01-01",
    ]);
  });

  it("keeps rent step ids so setRentStepNotified survives a lease edit", async () => {
    const { caller, accountId, opened } = await openOnA();
    const lease = opened.account.leases[0];
    const step = lease?.rentSteps[0];
    if (!lease || !step) throw new Error("missing step");

    const notified = await caller.lease.setRentStepNotified({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: lease.id,
      stepId: step.id,
      notified: true,
    });
    const notifiedAt =
      notified.account.leases[0]?.rentSteps[0]?.tenantNotifiedAt;
    expect(notifiedAt).toBeInstanceOf(Date);

    const edited = await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: lease.id,
      lease: {
        ...leaseInput({ startDate: "2025-01-01", endDate: "2025-12-31" }),
        insuranceExpiresOn: "2025-11-30",
        rentSteps: [
          { id: step.id, startsOn: "2025-01-01", amountCents: 250_000 },
        ],
      },
    });
    const kept = edited.account.leases[0]?.rentSteps[0];
    expect(kept?.id).toBe(step.id);
    expect(kept?.tenantNotifiedAt).toEqual(notifiedAt);

    const repriced = await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: lease.id,
      lease: {
        ...leaseInput({ startDate: "2025-01-01", endDate: "2025-12-31" }),
        rentSteps: [
          { id: step.id, startsOn: "2025-01-01", amountCents: 255_000 },
        ],
      },
    });
    const changed = repriced.account.leases[0]?.rentSteps[0];
    expect(changed?.id).toBe(step.id);
    expect(changed?.amountCents).toBe(255_000);
    expect(changed?.tenantNotifiedAt).toBeNull();

    await caller.lease.setRentStepNotified({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: lease.id,
      stepId: step.id,
      notified: true,
    });

    const cleared = await caller.lease.setRentStepNotified({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: lease.id,
      stepId: step.id,
      notified: false,
    });
    expect(
      cleared.account.leases[0]?.rentSteps[0]?.tenantNotifiedAt,
    ).toBeNull();
  });

  it("ignores rent step ids that are not on the lease", async () => {
    const { caller, accountId, opened, b, tenantId } = await openOnA();
    const lease = opened.account.leases[0];
    const step = lease?.rentSteps[0];
    if (!lease || !step) throw new Error("missing step");
    const other = await caller.account.open({
      tenantId,
      unitId: b.id,
      openingBalanceCents: 0,
      lease: leaseInput({ startDate: "2025-01-01", endDate: "2025-12-31" }),
    });
    const otherStepId = other.account.leases[0]?.rentSteps[0]?.id;
    if (!otherStepId) throw new Error("missing step");
    const unknownId = "66666666-6666-4666-8666-666666666666";

    const added = await caller.lease.add({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      lease: {
        ...leaseInput({ startDate: "2026-01-01", endDate: "2026-12-31" }),
        rentSteps: [
          { id: step.id, startsOn: "2026-01-01", amountCents: 260_000 },
          { id: unknownId, startsOn: "2026-07-01", amountCents: 270_000 },
        ],
      },
    });
    const addedIds = added.account.leases[1]?.rentSteps.map((s) => s.id);
    expect(addedIds).toHaveLength(2);
    expect(addedIds).not.toContain(step.id);
    expect(addedIds).not.toContain(unknownId);

    const updated = await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: lease.id,
      lease: {
        ...leaseInput({ startDate: "2025-01-01", endDate: "2025-12-31" }),
        rentSteps: [
          { id: step.id, startsOn: "2025-01-01", amountCents: 250_000 },
          { id: otherStepId, startsOn: "2025-07-01", amountCents: 255_000 },
        ],
      },
    });
    const updatedIds = updated.account.leases[0]?.rentSteps.map((s) => s.id);
    expect(updatedIds?.[0]).toBe(step.id);
    expect(updatedIds?.[1]).not.toBe(otherStepId);
    expect(updatedIds?.[1]).not.toBe(unknownId);
  });

  it("saves fixed charges and keeps their step ids on edit", async () => {
    const { caller, accountId, opened } = await openOnA();
    const leaseId = opened.account.leases[0]?.id;
    if (!leaseId) throw new Error("missing lease");
    const unknownId = "66666666-6666-4666-8666-666666666666";

    const saved = await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId,
      lease: leaseInput({
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        fixedCharges: [
          {
            name: " Trash ",
            steps: [{ startsOn: "2025-01-01", amountCents: 5_000 }],
          },
          {
            name: "Sign",
            steps: [
              { id: unknownId, startsOn: "2025-01-01", amountCents: 3_500 },
            ],
          },
        ],
      }),
    });
    const steps = saved.account.leases[0]?.fixedChargeSteps ?? [];
    expect(steps.map((s) => [s.name, s.startsOn, s.amountCents])).toEqual([
      ["Sign", "2025-01-01", 3_500],
      ["Trash", "2025-01-01", 5_000],
    ]);
    expect(steps.map((s) => s.id)).not.toContain(unknownId);
    const signId = steps[0]?.id;

    const edited = await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId,
      lease: leaseInput({
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        fixedCharges: [
          {
            name: "Sign",
            steps: [
              { id: signId, startsOn: "2025-01-01", amountCents: 3_500 },
              { startsOn: "2025-07-01", amountCents: 4_000 },
            ],
          },
        ],
      }),
    });
    const after = edited.account.leases[0]?.fixedChargeSteps ?? [];
    expect(after.map((s) => [s.name, s.startsOn, s.amountCents])).toEqual([
      ["Sign", "2025-01-01", 3_500],
      ["Sign", "2025-07-01", 4_000],
    ]);
    expect(after[0]?.id).toBe(signId);
  });

  it("rejects a stale fixed charge edit and a duplicate charge name", async () => {
    const { caller, accountId, opened } = await openOnA();
    const leaseId = opened.account.leases[0]?.id;
    if (!leaseId) throw new Error("missing lease");
    const version = await versionOf(caller, accountId);
    const sign = {
      name: "Sign",
      steps: [{ startsOn: "2025-01-01", amountCents: 3_500 }],
    };

    await caller.lease.update({
      accountId,
      expectedVersion: version,
      leaseId,
      lease: leaseInput({
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        fixedCharges: [sign],
      }),
    });
    const stale = await codeOf(
      caller.lease.update({
        accountId,
        expectedVersion: version,
        leaseId,
        lease: leaseInput({
          startDate: "2025-01-01",
          endDate: "2025-12-31",
          fixedCharges: [],
        }),
      }),
    );
    expect(stale).toBe("CONFLICT");

    await expect(
      caller.lease.update({
        accountId,
        expectedVersion: await versionOf(caller, accountId),
        leaseId,
        lease: leaseInput({
          startDate: "2025-01-01",
          endDate: "2025-12-31",
          fixedCharges: [
            sign,
            {
              name: "sign",
              steps: [{ startsOn: "2025-07-01", amountCents: 4_000 }],
            },
          ],
        }),
      }),
    ).rejects.toThrow("Two fixed charges are named sign");
  });

  it("checks pool membership only for leases the call adds or changes", async () => {
    const { caller, accountId, opened, a, poolId } = await openOnA();
    const water = poolId("Water");
    const waterLeaseId = opened.account.leases[0]?.id;
    if (!waterLeaseId) throw new Error("missing lease");
    await caller.pool.setUnits({ id: water, unitIds: [a.id] });
    const waterLease = leaseInput({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      estimates: [{ poolId: water, startsOn: "2025-01-01", amountCents: 1500 }],
    });
    await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: waterLeaseId,
      lease: waterLease,
    });
    const closingLease = leaseInput({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      moveOutDate: "2026-01-31",
    });
    const withClosing = await caller.lease.add({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      lease: closingLease,
    });
    expect(withClosing.account.state).toBe("closed");
    const closingLeaseId = withClosing.account.leases[1]?.id;
    if (!closingLeaseId) throw new Error("missing lease");
    await caller.pool.setUnits({ id: water, unitIds: [] });

    const balanced = await caller.account.setOpeningBalance({
      id: accountId,
      expectedVersion: await versionOf(caller, accountId),
      openingBalanceCents: 10_000,
    });
    expect(balanced.account.openingBalanceCents).toBe(10_000);

    const edited = await caller.lease.update({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      leaseId: closingLeaseId,
      lease: { ...closingLease, insuranceExpiresOn: "2026-11-30" },
    });
    expect(edited.account.leases[1]?.insuranceExpiresOn).toBe("2026-11-30");

    const earlier = await caller.lease.add({
      accountId,
      expectedVersion: await versionOf(caller, accountId),
      lease: leaseInput({ startDate: "2024-01-01", endDate: "2024-12-31" }),
    });
    expect(earlier.account.leases).toHaveLength(3);

    expect(
      await codeOf(
        caller.lease.update({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          leaseId: waterLeaseId,
          lease: { ...waterLease, insuranceExpiresOn: "2025-11-30" },
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.lease.update({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          leaseId: closingLeaseId,
          lease: leaseInput({
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            moveOutDate: "2026-01-31",
            estimates: [
              { poolId: water, startsOn: "2026-01-01", amountCents: 1500 },
            ],
          }),
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.lease.add({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          lease: leaseInput({
            startDate: "2023-01-01",
            endDate: "2023-12-31",
            estimates: [
              { poolId: water, startsOn: "2023-01-01", amountCents: 1500 },
            ],
          }),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("returns NOT_FOUND for an unknown lease or account", async () => {
    const { caller, accountId } = await openOnA();
    const missing = "55555555-5555-4555-8555-555555555555";

    expect(
      await codeOf(
        caller.lease.update({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          leaseId: missing,
          lease: leaseInput(),
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        caller.lease.add({
          accountId: missing,
          expectedVersion: 0,
          lease: leaseInput(),
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("rejects an invalid date in the input", async () => {
    const { caller, accountId } = await openOnA();

    expect(
      await codeOf(
        caller.lease.add({
          accountId,
          expectedVersion: await versionOf(caller, accountId),
          lease: leaseInput({ startDate: "2026-02-30" }),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});
