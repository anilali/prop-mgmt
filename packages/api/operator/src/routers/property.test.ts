import { describe, expect, it } from "vitest";

import {
  codeOf,
  createTestApp,
  PLATFORM_ADMIN,
  PROPERTY_ADMIN,
  PROPERTY_ID,
  TEST_ADDRESS,
} from "../test-setup-stores";

const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

describe("property platform procedures", () => {
  it("list, getForPlatform, and register reject a non-platform-admin with admin memberships", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(PROPERTY_ADMIN);

    expect(await codeOf(caller.property.list())).toBe("FORBIDDEN");
    expect(
      await codeOf(caller.property.getForPlatform({ propertyId: PROPERTY_ID })),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        caller.property.register({ name: "New", address: TEST_ADDRESS }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("list returns every property sorted by name", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(PLATFORM_ADMIN, "platform");
    const created = await caller.property.register({
      name: "alpha property",
      address: TEST_ADDRESS,
    });

    const properties = await caller.property.list();
    expect(properties.map((p) => p.id)).toEqual([created.id, PROPERTY_ID]);
  });

  it("getForPlatform returns the property or NOT_FOUND", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(PLATFORM_ADMIN, "platform");

    const property = await caller.property.getForPlatform({
      propertyId: PROPERTY_ID,
    });
    expect(property.name).toBe("Main Street Center");
    expect(
      await codeOf(caller.property.getForPlatform({ propertyId: UNKNOWN_ID })),
    ).toBe("NOT_FOUND");
  });

  it("register creates the property, seeds pools and categories, and no PropertyAccess", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(PLATFORM_ADMIN, "platform");

    const created = await caller.property.register({
      name: "Beta Property",
      address: TEST_ADDRESS,
    });

    expect(created.name).toBe("Beta Property");
    expect(created.timeZone).toBe("America/Chicago");
    expect(created.trackingStartDate).toBeNull();
    expect(await app.access.repository.findByPropertyId(created.id)).toBeNull();
    const pools = await app.billing.listPools(created.id);
    expect(pools.map((p) => [p.name, p.addsNewUnits, p.unitIds])).toEqual([
      ["CAM", true, []],
      ["Taxes", true, []],
      ["Insurance", true, []],
      ["Water", false, []],
    ]);
    const categories = await app.billing.listCategories(created.id);
    expect(categories).toHaveLength(9);
    expect(
      categories.filter((c) => c.kind === "shared_cost").map((c) => c.poolId),
    ).toEqual(expect.arrayContaining(pools.map((p) => p.id)));
  });

  it("register leaves nothing behind when seeding fails", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(PLATFORM_ADMIN, "platform");
    app.billing.failNextSave = true;

    await expect(
      caller.property.register({ name: "Broken", address: TEST_ADDRESS }),
    ).rejects.toThrow();

    expect(app.properties.properties.size).toBe(1);
    expect(app.billing.pools.size).toBe(4);
  });
});

describe("property setup procedures", () => {
  it("get returns the property with letter details, time zone, and today", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const property = await caller.property.get();

    expect(property.id).toBe(PROPERTY_ID);
    expect(property.trackingStartDate).toBe("2026-01-01");
    expect(property.timeZone).toBe("America/Chicago");
    expect(property.letter.ownerName).toBeNull();
    expect(property.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("update saves letter details and time zone", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const updated = await caller.property.update({
      timeZone: "America/Los_Angeles",
      letter: {
        ownerName: "Pat Owner",
        ownerTitle: "Managing Member",
        companyName: "Main Street LLC",
        ownerPhone: "555-0100",
        ownerEmail: "pat@example.com",
      },
    });

    expect(updated.timeZone).toBe("America/Los_Angeles");
    expect(updated.letter).toEqual({
      ownerName: "Pat Owner",
      ownerTitle: "Managing Member",
      companyName: "Main Street LLC",
      ownerPhone: "555-0100",
      ownerEmail: "pat@example.com",
    });
  });

  it("rejects an unknown time zone and a tracking start that is not the 1st", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    expect(
      await codeOf(caller.property.update({ timeZone: "Mars/Base" })),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(caller.property.update({ trackingStartDate: "2026-01-15" })),
    ).toBe("BAD_REQUEST");
  });

  it("changes the tracking start while nothing is recorded", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();

    const updated = await caller.property.update({
      trackingStartDate: "2025-01-01",
    });

    expect(updated.trackingStartDate).toBe("2025-01-01");
  });

  it("rejects a tracking start change once a transaction exists", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    app.billing.transactionCount = 1;

    expect(
      await codeOf(caller.property.update({ trackingStartDate: "2025-01-01" })),
    ).toBe("CONFLICT");
    expect(
      await caller.property.update({
        trackingStartDate: "2026-01-01",
        name: "Renamed",
      }),
    ).toMatchObject({ name: "Renamed", trackingStartDate: "2026-01-01" });
  });

  it("rejects a tracking start change once a ledger entry exists", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
    app.billing.ledgerEntryCount = 1;

    expect(
      await codeOf(caller.property.update({ trackingStartDate: null })),
    ).toBe("CONFLICT");
  });

  it("rejects a tracking start that would leave an opening balance on a later account", async () => {
    const app = createTestApp();
    const caller = await app.callerFor();
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
      openingBalanceCents: 41_374,
      lease: {
        startDate: "2025-06-01",
        endDate: "2027-05-31",
        rentSteps: [{ startsOn: "2025-06-01", amountCents: 250_000 }],
      },
    });

    expect(
      await codeOf(caller.property.update({ trackingStartDate: "2025-01-01" })),
    ).toBe("CONFLICT");
    expect(
      (await caller.property.update({ trackingStartDate: "2025-07-01" }))
        .trackingStartDate,
    ).toBe("2025-07-01");
  });
});
