import { describe, expect, it } from "vitest";

import type {
  RecordedLineInput,
  RecordedStatementInput,
} from "./recorded-year";
import type { ReconciliationYear } from "./types";
import { POOL_LIST, POOLS, reconciliationInput } from "./fixtures/2024";
import { reconciliationWorkspace } from "./reconciliation";
import {
  recordedPoolActuals,
  recordedYearPlan,
  recordedYearWorkspace,
} from "./recorded-year";

const PROPERTY_ID = "property-2024";
const CREATED_AT = new Date("2025-03-01T12:00:00Z");

function statements(): RecordedStatementInput[] {
  return reconciliationWorkspace(reconciliationInput()).statements.map(
    (statement) => {
      if (!statement.data) throw new Error("missing statement data");
      return {
        accountId: statement.accountId,
        tenantId: statement.tenantId,
        data: statement.data,
      };
    },
  );
}

function poolActual(poolId: string): number {
  const row = statements()
    .flatMap((s) => s.data.rows)
    .find((r) => r.poolId === poolId);
  if (!row) throw new Error(`missing pool ${poolId}`);
  return row.actualCents;
}

function lines(): RecordedLineInput[] {
  const poolIds = [
    ...new Set(statements().flatMap((s) => s.data.rows.map((r) => r.poolId))),
  ];
  return poolIds.flatMap((poolId): RecordedLineInput[] => {
    const actual = poolActual(poolId);
    if (poolId !== POOLS.cam) {
      return [
        {
          poolId,
          postedOn: "2024-06-01",
          description: `${poolId} bill`,
          source: "bank",
          costCents: actual,
        },
      ];
    }
    return [
      {
        poolId,
        postedOn: "2024-12-31",
        description: "Management fee",
        source: "cash",
        costCents: 100_000,
      },
      {
        poolId,
        postedOn: "2024-02-03",
        description: "Lot clean-up",
        source: "bank",
        costCents: actual - 100_000,
      },
    ];
  });
}

let nextId = 0;
function plan(overrides: Partial<Parameters<typeof recordedYearPlan>[0]> = {}) {
  return recordedYearPlan({
    propertyId: PROPERTY_ID,
    year: 2024,
    trackingStart: "2025-01-01",
    letterDate: "2025-01-01",
    statements: statements(),
    lines: lines(),
    createdAt: CREATED_AT,
    newId: () => `id-${++nextId}`,
    ...overrides,
  });
}

describe("recordedYearPlan", () => {
  it("records a finalized year with its statements and pool lines", () => {
    const result = plan();

    expect(result.record).toMatchObject({
      propertyId: PROPERTY_ID,
      year: 2024,
      status: "finalized",
      source: "recorded",
      letterDate: "2025-01-01",
      finalizedAt: CREATED_AT,
    });
    expect(result.snapshots).toHaveLength(statements().length);
    for (const snapshot of result.snapshots) {
      expect(snapshot.reconciliationYearId).toBe(result.record.id);
      expect(snapshot.trueUpCents).toBe(snapshot.data.trueUpCents);
      expect(snapshot.balanceOnAccountCents).toBe(
        snapshot.data.balanceOnAccountCents,
      );
      expect(snapshot.pdfStorageKey).toBe(
        `reconciliations/${PROPERTY_ID}/2024/${snapshot.accountId}.pdf`,
      );
    }
    expect(result.lines).toHaveLength(lines().length);
    expect(
      result.lines.every(
        (line) =>
          line.reconciliationYearId === result.record.id && line.year === 2024,
      ),
    ).toBe(true);
  });

  it("only records a year before the first reconciliation year", () => {
    expect(() => plan({ trackingStart: "2024-01-01" })).toThrow(
      "2024 is tracked in the app. Only a year before 2024 can be recorded.",
    );
    expect(() => plan({ trackingStart: "2024-03-01" })).not.toThrow();
  });

  it("needs a letter date after the year", () => {
    expect(() => plan({ letterDate: "2024-12-31" })).toThrow(
      "The letter date must be after 2024-12-31",
    );
  });

  it("needs each pool's lines to add up to the statements' actual cost", () => {
    const [first, ...rest] = lines();
    if (!first) throw new Error("missing line");
    expect(() =>
      plan({ lines: [{ ...first, costCents: first.costCents + 1 }, ...rest] }),
    ).toThrow(/lines add up to .* but the statements use/);
    expect(() =>
      plan({
        lines: [...lines(), { ...first, poolId: "pool-unknown" }],
      }),
    ).toThrow("is for a pool no statement has");
  });

  it("rejects statements that are not for the year or letter date", () => {
    const [first, ...rest] = statements();
    if (!first) throw new Error("missing statement");
    expect(() =>
      plan({
        statements: [
          { ...first, data: { ...first.data, letterDate: "2025-02-01" } },
          ...rest,
        ],
      }),
    ).toThrow("is not for 2024 with letter date 2025-01-01");
    expect(() => plan({ statements: [first, first] })).toThrow(
      "Each account can have only one statement",
    );
  });
});

describe("recordedYearWorkspace", () => {
  const result = plan();
  const record: ReconciliationYear = result.record;

  function view() {
    return recordedYearWorkspace({
      record,
      today: "2025-03-01",
      newestBankDate: "2025-02-28",
      snapshots: result.snapshots,
      lines: result.lines,
      pools: POOL_LIST,
    });
  }

  it("shows each pool's lines with an actual cost equal to the statements'", () => {
    const { workspace } = view();

    expect(workspace.pools.length).toBeGreaterThan(0);
    for (const pool of workspace.pools) {
      expect(pool.actualCents).toBe(poolActual(pool.poolId));
      expect(pool.categoryTotalCents).toBe(pool.actualCents);
      expect(pool.billOverride).toBeNull();
      for (const line of pool.lines) {
        expect(line.amountCents).toBeLessThan(0);
      }
    }
    const cam = workspace.pools.find((p) => p.poolId === POOLS.cam);
    expect(
      cam?.lines.map((l) => [l.postedOn, l.description, l.source]),
    ).toEqual([
      ["2024-02-03", "Lot clean-up", "bank"],
      ["2024-12-31", "Management fee", "cash"],
    ]);
    expect(workspace.pools.map((p) => p.poolId)).toEqual(
      POOL_LIST.filter((p) => workspace.pools.some((w) => w.poolId === p.id))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => p.id),
    );
  });

  it("is finalized and read-only with no comparison or January table", () => {
    const { workspace, finalized } = view();

    expect(workspace).toMatchObject({
      year: 2024,
      status: "finalized",
      source: "recorded",
      letterDate: "2025-01-01",
      priorBalanceAsOf: "2024-12-31",
      statements: [],
      checklist: [],
      canFinalize: false,
    });
    expect(workspace.gates.draft).toBe(false);
    expect(finalized.comparisons).toEqual([]);
    expect(finalized.mismatchCount).toBe(0);
    expect(finalized.january).toBeNull();
    expect(finalized.snapshots.map((s) => s.trueUpCents)).toEqual(
      [...result.snapshots]
        .sort((a, b) => a.data.unit.label.localeCompare(b.data.unit.label))
        .map((s) => s.trueUpCents),
    );
  });

  it("refuses a year made in the app", () => {
    expect(() =>
      recordedYearWorkspace({
        record: { ...record, source: "app" },
        today: "2025-03-01",
        newestBankDate: null,
        snapshots: [],
        lines: [],
        pools: [],
      }),
    ).toThrow("2024 is not a recorded year");
  });

  it("keeps pools in their setup order", () => {
    const reversed = POOL_LIST.map((p, i) => ({
      ...p,
      sortOrder: POOL_LIST.length - i,
    }));
    const pools = recordedPoolActuals({
      snapshots: result.snapshots,
      lines: result.lines,
      pools: reversed,
    });
    expect(pools.map((p) => p.poolId)).toEqual(
      [...reversed]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => p.id)
        .filter((id) => pools.some((p) => p.poolId === id)),
    );
  });
});
