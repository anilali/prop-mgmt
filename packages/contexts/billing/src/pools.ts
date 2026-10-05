import { prorate } from "@moonship/shared";

import type { Category, CategoryKind, Pool } from "./types";

export const NAME_MAX_LENGTH = 64;

export const DEFAULT_POOLS: readonly {
  name: string;
  letterName: string;
  addsNewUnits: boolean;
}[] = [
  { name: "CAM", letterName: "CAM", addsNewUnits: true },
  { name: "Taxes", letterName: "tax", addsNewUnits: true },
  { name: "Insurance", letterName: "insurance", addsNewUnits: true },
  { name: "Water", letterName: "water", addsNewUnits: false },
];

export const DEFAULT_CATEGORIES: readonly {
  name: string;
  kind: Exclude<CategoryKind, "shared_cost">;
}[] = [
  { name: "Repairs", kind: "owner_expense" },
  { name: "Owner utilities", kind: "owner_expense" },
  { name: "Other income", kind: "income" },
  { name: "Security deposit", kind: "not_counted" },
  { name: "Not property business", kind: "not_counted" },
];

export function cleanName(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${field} is required`);
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new Error(`${field} must be at most ${NAME_MAX_LENGTH} characters`);
  }
  return trimmed;
}

export function sharedCostCategory(pool: Pool, id: string): Category {
  return {
    id,
    propertyId: pool.propertyId,
    name: pool.name,
    kind: "shared_cost",
    poolId: pool.id,
    archivedAt: null,
  };
}

export function seedPropertySetup(input: {
  propertyId: string;
  unitIds: readonly string[];
  newId: () => string;
}): { pools: Pool[]; categories: Category[] } {
  const pools: Pool[] = DEFAULT_POOLS.map((seed, index) => ({
    id: input.newId(),
    propertyId: input.propertyId,
    name: seed.name,
    letterName: seed.letterName,
    addsNewUnits: seed.addsNewUnits,
    sortOrder: index,
    membersChangedOn: null,
    unitIds: seed.addsNewUnits ? [...input.unitIds] : [],
  }));
  const categories: Category[] = [
    ...pools.map((pool) => sharedCostCategory(pool, input.newId())),
    ...DEFAULT_CATEGORIES.map((seed) => ({
      id: input.newId(),
      propertyId: input.propertyId,
      name: seed.name,
      kind: seed.kind,
      poolId: null,
      archivedAt: null,
    })),
  ];
  return { pools, categories };
}

export interface PoolShareRow {
  unitId: string;
  sqft: number;
  shareBps: number;
}

export interface PoolShareTable {
  totalSqft: number;
  rows: PoolShareRow[];
}

export function poolShareTable(
  unitIds: readonly string[],
  units: readonly { id: string; sqft: number }[],
): PoolShareTable {
  const members = units.filter((unit) => unitIds.includes(unit.id));
  const totalSqft = members.reduce((sum, unit) => sum + unit.sqft, 0);
  return {
    totalSqft,
    rows: members.map((unit) => ({
      unitId: unit.id,
      sqft: unit.sqft,
      shareBps: totalSqft > 0 ? prorate(unit.sqft, [10_000], [totalSqft]) : 0,
    })),
  };
}
