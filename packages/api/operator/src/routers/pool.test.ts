import { describe, expect, it } from "vitest";

import {
  codeOf,
  createTestApp,
  leaseInput,
  TEST_ADDRESS,
} from "../test-setup-stores";

async function setup() {
  const app = createTestApp();
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
  const c = await caller.unit.create({
    label: "C",
    sqft: 2350,
    address: TEST_ADDRESS,
  });
  const pools = await caller.pool.list();
  const water = pools.find((p) => p.name === "Water");
  if (!water) throw new Error("missing water pool");
  const tenant = await caller.tenant.create({ businessName: "Tenant B" });
  if (!tenant) throw new Error("missing tenant");
  return { app, caller, a, b, c, water, tenantId: tenant.id };
}

describe("pool procedures", () => {
  it("list shows each pool with its category, total sqft, and shares", async () => {
    const { caller, a, b, c, water } = await setup();
    const updated = await caller.pool.setUnits({
      id: water.id,
      unitIds: [b.id, c.id],
    });

    expect(updated.totalSqft).toBe(4350);
    expect(updated.units).toEqual([
      { unitId: b.id, label: "B", sqft: 2000, shareBps: 4598 },
      { unitId: c.id, label: "C", sqft: 2350, shareBps: 5402 },
    ]);
    const cam = (await caller.pool.list()).find((p) => p.name === "CAM");
    expect(cam?.totalSqft).toBe(6850);
    expect(cam?.units.map((u) => u.unitId)).toEqual([a.id, b.id, c.id]);
    expect(cam?.categoryId).not.toBeNull();
  });

  it("setUnits does not set members_changed_on before the first transaction", async () => {
    const { caller, b, water } = await setup();
    const updated = await caller.pool.setUnits({
      id: water.id,
      unitIds: [b.id],
    });
    expect(updated.membersChangedOn).toBeNull();
  });

  it("setUnits sets members_changed_on once a transaction exists", async () => {
    const { app, caller, b, water } = await setup();
    app.billing.transactionCount = 1;
    const { today } = await caller.property.get();

    const unchanged = await caller.pool.setUnits({ id: water.id, unitIds: [] });
    expect(unchanged.membersChangedOn).toBeNull();
    const updated = await caller.pool.setUnits({
      id: water.id,
      unitIds: [b.id],
    });
    expect(updated.membersChangedOn).toBe(today);
  });

  it("setUnits is rejected when it removes a unit whose open account pays the pool", async () => {
    const { caller, b, c, water, tenantId } = await setup();
    await caller.pool.setUnits({ id: water.id, unitIds: [b.id, c.id] });
    await caller.account.open({
      tenantId,
      unitId: b.id,
      openingBalanceCents: 0,
      lease: leaseInput({
        startDate: "2024-01-01",
        endDate: "2099-12-31",
        estimates: [
          { poolId: water.id, startsOn: "2024-07-01", amountCents: 15_000 },
        ],
      }),
    });

    expect(
      await codeOf(caller.pool.setUnits({ id: water.id, unitIds: [c.id] })),
    ).toBe("CONFLICT");
  });

  it("setUnits is rejected for an upcoming account that pays the pool", async () => {
    const { caller, b, water, tenantId } = await setup();
    await caller.pool.setUnits({ id: water.id, unitIds: [b.id] });
    await caller.account.open({
      tenantId,
      unitId: b.id,
      openingBalanceCents: 0,
      lease: leaseInput({
        startDate: "2099-01-01",
        endDate: "2099-12-31",
        estimates: [
          { poolId: water.id, startsOn: "2099-01-01", amountCents: 15_000 },
        ],
      }),
    });

    expect(
      await codeOf(caller.pool.setUnits({ id: water.id, unitIds: [] })),
    ).toBe("CONFLICT");
  });

  it("setUnits accepts removing a vacant unit and a unit whose account is closed", async () => {
    const { caller, b, c, water, tenantId } = await setup();
    await caller.pool.setUnits({ id: water.id, unitIds: [b.id, c.id] });
    await caller.account.open({
      tenantId,
      unitId: b.id,
      openingBalanceCents: 0,
      lease: leaseInput({
        startDate: "2020-01-01",
        endDate: "2020-12-31",
        moveOutDate: "2020-12-31",
        estimates: [
          { poolId: water.id, startsOn: "2020-01-01", amountCents: 15_000 },
        ],
      }),
    });

    const updated = await caller.pool.setUnits({ id: water.id, unitIds: [] });
    expect(updated.units).toEqual([]);
  });

  it("create adds a pool with its shared-cost category, and update renames both", async () => {
    const { caller, a } = await setup();

    const created = await caller.pool.create({
      name: "Trash",
      letterName: "trash",
      unitIds: [a.id],
      addsNewUnits: false,
    });
    expect(created.sortOrder).toBe(4);
    expect(created.totalSqft).toBe(2500);
    const categories = await caller.category.list();
    const category = categories.find((c) => c.id === created.categoryId);
    expect(category).toMatchObject({ name: "Trash", kind: "shared_cost" });

    const renamed = await caller.pool.update({
      id: created.id,
      name: "Garbage",
      letterName: "garbage",
    });
    expect(renamed.name).toBe("Garbage");
    expect(renamed.letterName).toBe("garbage");
    const after = await caller.category.list();
    expect(after.find((c) => c.id === created.categoryId)?.name).toBe(
      "Garbage",
    );
  });

  it("create and update reject a name used by another pool or category", async () => {
    const { caller, water } = await setup();

    expect(
      await codeOf(
        caller.pool.create({
          name: "Repairs",
          letterName: "repairs",
          unitIds: [],
          addsNewUnits: false,
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      await codeOf(caller.pool.update({ id: water.id, name: "CAM" })),
    ).toBe("CONFLICT");
    expect(
      (await caller.pool.update({ id: water.id, name: "Water" })).name,
    ).toBe("Water");
  });

  it("remove deletes the pool and its category", async () => {
    const { caller, water } = await setup();

    expect(await caller.pool.remove({ id: water.id })).toEqual({ ok: true });

    expect((await caller.pool.list()).map((p) => p.name)).toEqual([
      "CAM",
      "Taxes",
      "Insurance",
    ]);
    expect((await caller.category.list()).some((c) => c.name === "Water")).toBe(
      false,
    );
  });

  it("remove is rejected when an estimate step or allocation line uses the pool", async () => {
    const { app, caller, a, tenantId } = await setup();
    const pools = await caller.pool.list();
    const cam = pools.find((p) => p.name === "CAM");
    const taxes = pools.find((p) => p.name === "Taxes");
    if (!cam?.categoryId || !taxes) throw new Error("missing pools");
    await caller.account.open({
      tenantId,
      unitId: a.id,
      openingBalanceCents: 0,
      lease: leaseInput({
        estimates: [
          { poolId: taxes.id, startsOn: "2026-01-01", amountCents: 77_761 },
        ],
      }),
    });
    app.billing.allocatedCategoryIds.add(cam.categoryId);

    expect(await codeOf(caller.pool.remove({ id: taxes.id }))).toBe("CONFLICT");
    expect(await codeOf(caller.pool.remove({ id: cam.id }))).toBe("CONFLICT");
  });

  it("remove is rejected when a reconciliation year has a bill amount for the pool", async () => {
    const { caller, water } = await setup();
    await caller.reconciliation.setBillOverride({
      year: 2026,
      poolId: water.id,
      amountCents: 10_000,
      note: "Water bill",
    });

    expect(await codeOf(caller.pool.remove({ id: water.id }))).toBe("CONFLICT");
  });
});
