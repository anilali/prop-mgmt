import { describe, expect, it } from "vitest";

import { cleanName, poolShareTable, seedPropertySetup } from "./pools";

const UNITS = [
  { id: "A", sqft: 2500 },
  { id: "B", sqft: 2000 },
  { id: "C", sqft: 2350 },
  { id: "D", sqft: 1250 },
  { id: "E", sqft: 1250 },
];

describe("poolShareTable", () => {
  it("shows each unit's share of the building, vacant units included", () => {
    const table = poolShareTable(["A", "B", "C", "D", "E"], UNITS);

    expect(table.totalSqft).toBe(9350);
    expect(table.rows.map((r) => [r.unitId, r.shareBps])).toEqual([
      ["A", 2674],
      ["B", 2139],
      ["C", 2513],
      ["D", 1337],
      ["E", 1337],
    ]);
  });

  it("shows shares within a smaller pool", () => {
    const table = poolShareTable(["B", "C"], UNITS);

    expect(table.totalSqft).toBe(4350);
    expect(table.rows.map((r) => [r.unitId, r.shareBps])).toEqual([
      ["B", 4598],
      ["C", 5402],
    ]);
  });

  it("returns no rows for a pool with no units", () => {
    expect(poolShareTable([], UNITS)).toEqual({ totalSqft: 0, rows: [] });
  });

  it("ignores unit ids that are not in the unit list", () => {
    expect(poolShareTable(["A", "gone"], UNITS).totalSqft).toBe(2500);
  });
});

describe("seedPropertySetup", () => {
  it("seeds four pools and nine categories", () => {
    let next = 0;
    const { pools, categories } = seedPropertySetup({
      propertyId: "p",
      unitIds: ["A", "B"],
      newId: () => `id-${next++}`,
    });

    expect(
      pools.map((p) => [
        p.name,
        p.letterName,
        p.addsNewUnits,
        p.sortOrder,
        p.unitIds,
      ]),
    ).toEqual([
      ["CAM", "CAM", true, 0, ["A", "B"]],
      ["Taxes", "tax", true, 1, ["A", "B"]],
      ["Insurance", "insurance", true, 2, ["A", "B"]],
      ["Water", "water", false, 3, []],
    ]);
    expect(categories.map((c) => [c.name, c.kind])).toEqual([
      ["CAM", "shared_cost"],
      ["Taxes", "shared_cost"],
      ["Insurance", "shared_cost"],
      ["Water", "shared_cost"],
      ["Repairs", "owner_expense"],
      ["Owner utilities", "owner_expense"],
      ["Other income", "income"],
      ["Security deposit", "not_counted"],
      ["Not property business", "not_counted"],
    ]);
    expect(categories.slice(0, 4).map((c) => c.poolId)).toEqual(
      pools.map((p) => p.id),
    );
    expect(categories.slice(4).every((c) => c.poolId === null)).toBe(true);
    expect(new Set([...pools, ...categories].map((x) => x.id)).size).toBe(13);
  });
});

describe("cleanName", () => {
  it("trims names and rejects empty or long ones", () => {
    expect(cleanName("  CAM ", "Name")).toBe("CAM");
    expect(() => cleanName(" ", "Name")).toThrow("Name is required");
    expect(() => cleanName("x".repeat(65), "Name")).toThrow(
      "Name must be at most 64 characters",
    );
  });
});
