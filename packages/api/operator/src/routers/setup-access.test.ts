import { describe, expect, it } from "vitest";

import type { TestCaller } from "../test-setup-stores";
import {
  codeOf,
  createTestApp,
  leaseInput,
  PLATFORM_ADMIN,
  STRANGER,
  TEST_ADDRESS,
} from "../test-setup-stores";

const ID = "66666666-6666-4666-8666-666666666666";

const calls: [string, (caller: TestCaller) => Promise<unknown>][] = [
  ["property.get", (c) => c.property.get()],
  ["property.update", (c) => c.property.update({ name: "X" })],
  ["unit.list", (c) => c.unit.list()],
  ["unit.get", (c) => c.unit.get({ id: ID })],
  [
    "unit.create",
    (c) => c.unit.create({ label: "A", sqft: 1, address: TEST_ADDRESS }),
  ],
  ["unit.update", (c) => c.unit.update({ id: ID, sqft: 2 })],
  ["unit.remove", (c) => c.unit.remove({ id: ID })],
  ["pool.list", (c) => c.pool.list()],
  [
    "pool.create",
    (c) =>
      c.pool.create({
        name: "Trash",
        letterName: "trash",
        unitIds: [],
        addsNewUnits: false,
      }),
  ],
  ["pool.update", (c) => c.pool.update({ id: ID, name: "Y" })],
  ["pool.setUnits", (c) => c.pool.setUnits({ id: ID, unitIds: [] })],
  ["pool.remove", (c) => c.pool.remove({ id: ID })],
  ["category.list", (c) => c.category.list()],
  ["category.create", (c) => c.category.create({ name: "Z", kind: "income" })],
  ["category.rename", (c) => c.category.rename({ id: ID, name: "Z" })],
  ["category.archive", (c) => c.category.archive({ id: ID })],
  ["category.unarchive", (c) => c.category.unarchive({ id: ID })],
  ["tenant.list", (c) => c.tenant.list()],
  ["tenant.get", (c) => c.tenant.get({ id: ID })],
  ["tenant.create", (c) => c.tenant.create({ businessName: "T" })],
  ["tenant.update", (c) => c.tenant.update({ id: ID, businessName: "T" })],
  ["tenant.archive", (c) => c.tenant.archive({ id: ID })],
  ["account.list", (c) => c.account.list()],
  ["account.get", (c) => c.account.get({ id: ID })],
  [
    "account.open",
    (c) =>
      c.account.open({
        tenantId: ID,
        unitId: ID,
        openingBalanceCents: 0,
        lease: leaseInput(),
      }),
  ],
  [
    "account.setOpeningBalance",
    (c) =>
      c.account.setOpeningBalance({
        id: ID,
        expectedVersion: 0,
        openingBalanceCents: 0,
      }),
  ],
  ["account.remove", (c) => c.account.remove({ id: ID })],
  [
    "lease.add",
    (c) =>
      c.lease.add({ accountId: ID, expectedVersion: 0, lease: leaseInput() }),
  ],
  [
    "lease.update",
    (c) =>
      c.lease.update({
        accountId: ID,
        expectedVersion: 0,
        leaseId: ID,
        lease: leaseInput(),
      }),
  ],
  [
    "lease.remove",
    (c) => c.lease.remove({ accountId: ID, expectedVersion: 0, leaseId: ID }),
  ],
  [
    "lease.setRentStepNotified",
    (c) =>
      c.lease.setRentStepNotified({
        accountId: ID,
        expectedVersion: 0,
        leaseId: ID,
        stepId: ID,
        notified: true,
      }),
  ],
];

describe("setup procedures need property mode and membership", () => {
  it.each(calls)("%s rejects platform mode", async (_name, call) => {
    const caller = await createTestApp().callerFor(PLATFORM_ADMIN, "platform");
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });

  it.each(calls)("%s rejects a non-member", async (_name, call) => {
    const caller = await createTestApp().callerFor(STRANGER);
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });
});
