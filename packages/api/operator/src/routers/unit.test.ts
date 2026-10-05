import { describe, expect, it } from "vitest";

import { codeOf, createTestApp, TEST_ADDRESS } from "../test-setup-stores";

async function setup() {
  const app = createTestApp();
  const caller = await app.callerFor();
  const pools = await caller.pool.list();
  const poolId = (name: string) => {
    const pool = pools.find((p) => p.name === name);
    if (!pool) throw new Error(`missing pool ${name}`);
    return pool.id;
  };
  return { app, caller, poolId };
}

describe("unit procedures", () => {
  it("create joins pools with addsNewUnits and no others", async () => {
    const { caller, poolId } = await setup();

    const unit = await caller.unit.create({
      label: "A",
      sqft: 2500,
      address: { ...TEST_ADDRESS, street2: "Suite A" },
    });

    expect(unit.poolIds.sort()).toEqual(
      [poolId("CAM"), poolId("Taxes"), poolId("Insurance")].sort(),
    );
    expect(unit.address.street2).toBe("Suite A");
    const water = (await caller.pool.list()).find((p) => p.name === "Water");
    expect(water?.units).toEqual([]);
  });

  it("create adds the new unit and keeps existing pool members", async () => {
    const { caller, poolId } = await setup();
    const a = await caller.unit.create({
      label: "A",
      sqft: 2500,
      address: TEST_ADDRESS,
    });
    await caller.pool.setUnits({ id: poolId("Water"), unitIds: [a.id] });

    const b = await caller.unit.create({
      label: "B",
      sqft: 2000,
      address: TEST_ADDRESS,
    });

    const pools = await caller.pool.list();
    const members = (name: string) =>
      pools
        .find((p) => p.name === name)
        ?.units.map((u) => u.unitId)
        .sort();
    expect(members("CAM")).toEqual([a.id, b.id].sort());
    expect(members("Water")).toEqual([a.id]);
  });

  it("create does not set members_changed_on before the first transaction", async () => {
    const { caller } = await setup();
    await caller.unit.create({ label: "A", sqft: 2500, address: TEST_ADDRESS });

    const pools = await caller.pool.list();
    expect(pools.every((p) => p.membersChangedOn === null)).toBe(true);
  });

  it("create sets members_changed_on once a transaction exists", async () => {
    const { app, caller } = await setup();
    app.billing.transactionCount = 1;
    const { today } = await caller.property.get();

    await caller.unit.create({ label: "A", sqft: 2500, address: TEST_ADDRESS });

    const pools = await caller.pool.list();
    expect(pools.map((p) => [p.name, p.membersChangedOn]).sort()).toEqual(
      [
        ["CAM", today],
        ["Insurance", today],
        ["Taxes", today],
        ["Water", null],
      ].sort(),
    );
  });

  it("create rolls back the unit when joining pools fails", async () => {
    const { app, caller } = await setup();
    app.billing.failNextSave = true;

    await expect(
      caller.unit.create({ label: "A", sqft: 2500, address: TEST_ADDRESS }),
    ).rejects.toThrow();

    expect(await caller.unit.list()).toEqual([]);
  });

  it("rejects a duplicate label and a non-positive sqft", async () => {
    const { caller } = await setup();
    await caller.unit.create({ label: "A", sqft: 2500, address: TEST_ADDRESS });

    expect(
      await codeOf(
        caller.unit.create({ label: " A ", sqft: 100, address: TEST_ADDRESS }),
      ),
    ).toBe("CONFLICT");
    expect(
      await codeOf(
        caller.unit.create({ label: "B", sqft: 0, address: TEST_ADDRESS }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("update sets sqft_changed_on only after the first transaction", async () => {
    const { app, caller } = await setup();
    const unit = await caller.unit.create({
      label: "A",
      sqft: 2500,
      address: TEST_ADDRESS,
    });

    const first = await caller.unit.update({ id: unit.id, sqft: 2400 });
    expect(first.sqftChangedOn).toBeNull();

    app.billing.transactionCount = 1;
    const { today } = await caller.property.get();
    const relabeled = await caller.unit.update({ id: unit.id, label: "A1" });
    expect(relabeled.sqftChangedOn).toBeNull();
    const second = await caller.unit.update({ id: unit.id, sqft: 2300 });
    expect(second.sqftChangedOn).toBe(today);
  });

  it("remove deletes a vacant unit and its pool membership", async () => {
    const { caller } = await setup();
    const unit = await caller.unit.create({
      label: "A",
      sqft: 2500,
      address: TEST_ADDRESS,
    });

    expect(await caller.unit.remove({ id: unit.id })).toEqual({ ok: true });

    expect(await caller.unit.list()).toEqual([]);
    const pools = await caller.pool.list();
    expect(pools.every((p) => p.units.length === 0)).toBe(true);
  });

  it("remove is rejected when an account uses the unit", async () => {
    const { caller } = await setup();
    const unit = await caller.unit.create({
      label: "A",
      sqft: 2500,
      address: TEST_ADDRESS,
    });
    const tenant = await caller.tenant.create({ businessName: "Super Lucky" });
    if (!tenant) throw new Error("missing tenant");
    await caller.account.open({
      tenantId: tenant.id,
      unitId: unit.id,
      openingBalanceCents: 0,
      lease: {
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        moveOutDate: "2024-08-15",
        rentSteps: [{ startsOn: "2024-01-01", amountCents: 1 }],
        fixedCharges: [],
      },
    });

    expect(await codeOf(caller.unit.remove({ id: unit.id }))).toBe("CONFLICT");
  });
});
