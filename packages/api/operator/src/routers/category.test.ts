import { describe, expect, it } from "vitest";

import { codeOf, createTestApp } from "../test-setup-stores";

describe("category procedures", () => {
  it("lists the seeded categories", async () => {
    const caller = await createTestApp().callerFor();

    const categories = await caller.category.list();

    expect(categories.map((c) => c.name).sort()).toEqual(
      [
        "CAM",
        "Taxes",
        "Insurance",
        "Water",
        "Repairs",
        "Owner utilities",
        "Other income",
        "Security deposit",
        "Not property business",
      ].sort(),
    );
  });

  it("creates, renames, archives, and unarchives an owner category", async () => {
    const caller = await createTestApp().callerFor();

    const created = await caller.category.create({
      name: "Landscaping",
      kind: "owner_expense",
    });
    const renamed = await caller.category.rename({
      id: created.id,
      name: "Grounds",
    });
    expect(renamed.name).toBe("Grounds");

    const archived = await caller.category.archive({ id: created.id });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(
      (await caller.category.list()).some((c) => c.id === created.id),
    ).toBe(false);
    expect(
      (await caller.category.list({ includeArchived: true })).some(
        (c) => c.id === created.id,
      ),
    ).toBe(true);

    const restored = await caller.category.unarchive({ id: created.id });
    expect(restored.archivedAt).toBeNull();
  });

  it("rejects archiving or renaming a shared-cost category", async () => {
    const caller = await createTestApp().callerFor();
    const cam = (await caller.category.list()).find((c) => c.name === "CAM");
    if (!cam) throw new Error("missing CAM");

    expect(await codeOf(caller.category.archive({ id: cam.id }))).toBe(
      "BAD_REQUEST",
    );
    expect(
      await codeOf(caller.category.rename({ id: cam.id, name: "Common" })),
    ).toBe("BAD_REQUEST");
  });

  it("rejects creating a shared-cost category and duplicate names", async () => {
    const caller = await createTestApp().callerFor();

    expect(
      await codeOf(
        caller.category.create({
          name: "Elevator",
          kind: "shared_cost" as "income",
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        caller.category.create({ name: "Repairs", kind: "owner_expense" }),
      ),
    ).toBe("CONFLICT");
    expect(
      await codeOf(caller.category.create({ name: "Water", kind: "income" })),
    ).toBe("CONFLICT");
  });
});
