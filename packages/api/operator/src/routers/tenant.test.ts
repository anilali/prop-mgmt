import { describe, expect, it } from "vitest";

import { codeOf, createTestApp, TEST_ADDRESS } from "../test-setup-stores";

describe("tenant procedures", () => {
  it("creates and updates a tenant with business name, contact, and mailing address", async () => {
    const caller = await createTestApp().callerFor();

    const created = await caller.tenant.create({
      businessName: "Super Lucky LLC",
      contactName: "Jane Doe",
      mailingAddress: TEST_ADDRESS,
      email: "jane@example.com",
    });
    if (!created) throw new Error("missing tenant");
    expect(created).toMatchObject({
      businessName: "Super Lucky LLC",
      contactName: "Jane Doe",
      mailingAddress: TEST_ADDRESS,
      status: "active",
    });

    const updated = await caller.tenant.update({
      id: created.id,
      contactName: null,
      mailingAddress: null,
    });
    expect(updated?.contactName).toBeUndefined();
    expect(updated?.mailingAddress).toBeUndefined();
    expect(updated?.businessName).toBe("Super Lucky LLC");
  });

  it("rejects a blank business name", async () => {
    const caller = await createTestApp().callerFor();

    expect(await codeOf(caller.tenant.create({ businessName: "   " }))).toBe(
      "BAD_REQUEST",
    );
  });
});
