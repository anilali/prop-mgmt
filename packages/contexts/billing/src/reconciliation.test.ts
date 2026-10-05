import { describe, expect, it } from "vitest";

import type {
  AccountStatement,
  FinalizePlan,
  ReconciliationInput,
} from "./reconciliation";
import type {
  AccountTerms,
  LeaseTerms,
  PoolBillOverride,
  StatementSnapshot,
  Txn,
} from "./types";
import {
  ACCOUNTS,
  CATEGORY_IDS,
  EXPENSES,
  LETTER,
  POOL_LIST,
  POOLS,
  RECONCILIATION_UNITS,
  reconciliationInput,
  superLucky,
  tenantB,
  tenantD,
  TENANTS,
  TRANSACTIONS,
} from "./fixtures/2024";
import {
  compareSnapshots,
  finalizeBlockers,
  finalizedYearView,
  finalizePlan,
  firstReconciliationYear,
  januaryTable,
  reconciliationWorkspace,
} from "./reconciliation";

function workspace(overrides: Partial<ReconciliationInput> = {}) {
  return reconciliationWorkspace(reconciliationInput(overrides));
}

function statementFor(
  accountId: string,
  overrides: Partial<ReconciliationInput> = {},
): AccountStatement {
  const statement = workspace(overrides).statements.find(
    (s) => s.accountId === accountId,
  );
  if (!statement) throw new Error(`No statement for ${accountId}`);
  return statement;
}

function rowsOf(statement: AccountStatement) {
  return statement.rows.map((row) => [
    row.name,
    row.months,
    row.shareBps,
    row.partCents,
    row.estimatesCents,
    row.balanceCents,
  ]);
}

function override(
  poolId: string,
  amountCents: number,
  year = 2024,
  note = "County bill",
): PoolBillOverride {
  return {
    id: `override-${poolId}-${year}`,
    propertyId: "property-2024",
    reconciliationYearId: `year-${year}`,
    year,
    poolId,
    amountCents,
    note,
  };
}

function codes(overrides: Partial<ReconciliationInput> = {}) {
  return workspace(overrides).checklist.map((item) => [
    item.severity,
    item.code,
  ]);
}

describe("first reconciliation year", () => {
  it("is the first year whose January 1 is on or after the tracking start", () => {
    expect(firstReconciliationYear("2024-01-01")).toBe(2024);
    expect(firstReconciliationYear("2024-02-01")).toBe(2025);
    expect(firstReconciliationYear("2024-12-01")).toBe(2025);
  });
});

describe("pool actual cost (5.8)", () => {
  it("sums category lines in the year with refunds subtracting", () => {
    const pools = workspace().pools;
    expect(
      pools.map((pool) => [
        pool.name,
        pool.poolSqft,
        pool.actualCents,
        pool.costPerSqftYearCents,
        pool.costPerSqftMonthHundredths,
      ]),
    ).toEqual([
      ["CAM", 9350, 1_289_119, 138, 1149],
      ["Taxes", 9350, 3_354_231, 359, 2990],
      ["Insurance", 9350, 628_400, 67, 560],
      ["Water", 4350, 187_917, 43, 360],
    ]);
  });

  it("lists the transactions behind each pool, leaving out other years", () => {
    const cam = workspace().pools[0];
    expect(
      cam?.lines.map((line) => [line.transactionId, line.amountCents]),
    ).toEqual([
      ["cam-1", -1_000_000],
      ["cam-2", -314_119],
      ["cam-refund", 25_000],
    ]);
    expect(cam?.categoryTotalCents).toBe(1_289_119);
    expect(cam?.billOverride).toBeNull();
  });

  it("uses the bill amount when one is entered and keeps the category total next to it", () => {
    const result = workspace({
      overrides: [override(POOLS.taxes, 3_400_000, 2024, "2024 tax bill")],
    });
    const taxes = result.pools.find((pool) => pool.poolId === POOLS.taxes);
    expect(taxes?.actualCents).toBe(3_400_000);
    expect(taxes?.categoryTotalCents).toBe(3_354_231);
    expect(taxes?.billOverride).toEqual({
      amountCents: 3_400_000,
      note: "2024 tax bill",
    });
    const lucky = result.statements.find(
      (s) => s.accountId === superLucky.accountId,
    );
    const row = lucky?.rows.find((r) => r.poolId === POOLS.taxes);
    expect(row?.partCents).toBe(909_091);
    expect(row?.billOverride?.note).toBe("2024 tax bill");
  });

  it("ignores a bill amount from another year", () => {
    const taxes = workspace({
      overrides: [override(POOLS.taxes, 1, 2023)],
    }).pools.find((pool) => pool.poolId === POOLS.taxes);
    expect(taxes?.actualCents).toBe(3_354_231);
  });
});

describe("6.1 Super Lucky, full year", () => {
  const statement = statementFor(superLucky.accountId);

  it("matches every pool line", () => {
    expect(rowsOf(statement)).toEqual([
      ["CAM", 12, 2674, 344_684, 322_332, 22_352],
      ["Taxes", 12, 2674, 896_853, 933_132, -36_279],
      ["Insurance", 12, 2674, 168_021, 130_320, 37_701],
    ]);
  });

  it("matches the true-up, rent balance, and balance on account", () => {
    expect(statement.countedMonths).toHaveLength(12);
    expect(statement.trueUpCents).toBe(23_774);
    expect(statement.priorBalanceCents).toBe(41_374);
    expect(statement.priorBalanceAsOf).toBe("2024-12-31");
    expect(statement.balanceOnAccountCents).toBe(65_148);
  });

  it("sets new estimates and rent from January 1 with the insurance request", () => {
    expect(statement.continuing).toEqual({
      leaseId: "lease-super-lucky",
      leaseStartDate: "2023-01-01",
      effectiveDate: "2025-01-01",
      baseRentCents: 250_000,
      fixedCharges: [],
      newEstimates: [
        {
          poolId: POOLS.cam,
          name: "CAM",
          letterName: "CAM",
          amountCents: 28_724,
          carriedOver: false,
        },
        {
          poolId: POOLS.taxes,
          name: "Taxes",
          letterName: "tax",
          amountCents: 74_738,
          carriedOver: false,
        },
        {
          poolId: POOLS.insurance,
          name: "Insurance",
          letterName: "insurance",
          amountCents: 14_002,
          carriedOver: false,
        },
      ],
      newMonthlyRentCents: 367_464,
      rentIncreases: [],
      insuranceExpiresOn: "2024-11-30",
      insuranceRequest: true,
      leaseOnJanuary1: {
        estimates: [
          { poolId: POOLS.cam, name: "CAM", amountCents: 26_861 },
          { poolId: POOLS.taxes, name: "Taxes", amountCents: 77_761 },
          { poolId: POOLS.insurance, name: "Insurance", amountCents: 10_860 },
        ],
        monthlyRentCents: 365_482,
        rentIncreases: [],
      },
    });
  });

  it("builds the statement data", () => {
    expect(statement.fileName).toBe(
      "2024 Reconciliation Super Lucky LLC A.pdf",
    );
    expect(statement.data).toMatchObject({
      year: 2024,
      letterDate: "2025-01-01",
      property: { name: "Lucky Plaza" },
      owner: {
        name: "Pat Owner",
        title: "Managing Member",
        company: "Lucky Plaza LLC",
        phone: "(555) 010-2000",
        email: "owner@example.com",
      },
      tenant: { businessName: "Super Lucky LLC" },
      unit: { label: "A", sqft: 2500 },
      buildingSqft: 9350,
      otherPoolAreas: [],
      trueUpCents: 23_774,
      priorBalanceCents: 41_374,
      priorBalanceAsOf: "2024-12-31",
      balanceOnAccountCents: 65_148,
      continuing: {
        effectiveDate: "2025-01-01",
        baseRentCents: 250_000,
        newMonthlyRentCents: 367_464,
        insuranceRequest: true,
      },
    });
    expect(statement.data?.rows.map((row) => row.actualCents)).toEqual([
      1_289_119, 3_354_231, 628_400,
    ]);
  });
});

describe("fixed monthly charges", () => {
  const lease = superLucky.leases[0];
  if (!lease) throw new Error("Super Lucky needs a lease");
  const withCharges: AccountTerms = {
    ...superLucky,
    leases: [
      {
        ...lease,
        fixedChargeSteps: [
          {
            id: "s1",
            name: "Sign",
            startsOn: "2023-01-01",
            amountCents: 3_500,
          },
          {
            id: "t1",
            name: "Trash",
            startsOn: "2023-01-01",
            amountCents: 5_000,
          },
          {
            id: "t2",
            name: "Trash",
            startsOn: "2025-01-01",
            amountCents: 6_000,
          },
        ],
      },
    ],
  };
  const statement = statementFor(superLucky.accountId, {
    accounts: [withCharges, tenantB, tenantD],
  });

  it("leaves the pool rows and true-up alone", () => {
    expect(statement.trueUpCents).toBe(23_774);
    expect(statement.rows.map((row) => row.estimatesCents)).toEqual([
      322_332, 933_132, 130_320,
    ]);
  });

  it("counts the charges in the rent balance", () => {
    expect(statement.priorBalanceCents).toBe(41_374 + 12 * 8_500);
  });

  it("lists a rent step after January 1 with the charges in effect then", () => {
    const steps: AccountTerms = {
      ...withCharges,
      leases: withCharges.leases.map((l) => ({
        ...l,
        rentSteps: [
          ...l.rentSteps,
          {
            id: "r2",
            startsOn: "2025-01-01",
            amountCents: 251_000,
            tenantNotifiedAt: null,
          },
          {
            id: "r3",
            startsOn: "2025-04-01",
            amountCents: 255_000,
            tenantNotifiedAt: null,
          },
          {
            id: "r4",
            startsOn: "2026-01-01",
            amountCents: 260_000,
            tenantNotifiedAt: null,
          },
        ],
      })),
    };
    const result = statementFor(superLucky.accountId, {
      accounts: [steps, tenantB, tenantD],
    });
    expect(result.continuing?.baseRentCents).toBe(251_000);
    expect(result.data?.continuing?.rentIncreases).toEqual([
      {
        effectiveOn: "2025-04-01",
        fromCents: 251_000,
        toCents: 255_000,
        newMonthlyRentCents: 255_000 + 117_464 + 9_500,
      },
    ]);
    expect(result.continuing?.leaseOnJanuary1.rentIncreases).toEqual([
      {
        effectiveOn: "2025-04-01",
        fromCents: 251_000,
        toCents: 255_000,
        newMonthlyRentCents: 255_000 + 115_482 + 9_500,
      },
    ]);
  });

  it("adds the charges in effect on January 1 to the new monthly rent", () => {
    expect(statement.continuing?.fixedCharges).toEqual([
      { name: "Sign", amountCents: 3_500 },
      { name: "Trash", amountCents: 6_000 },
    ]);
    expect(statement.continuing?.newMonthlyRentCents).toBe(367_464 + 9_500);
    expect(statement.continuing?.leaseOnJanuary1.monthlyRentCents).toBe(
      365_482 + 9_500,
    );
    expect(statement.data?.continuing).toMatchObject({
      fixedCharges: [
        { name: "Sign", amountCents: 3_500 },
        { name: "Trash", amountCents: 6_000 },
      ],
      newMonthlyRentCents: 376_964,
    });
  });
});

describe("6.2 Tenant D, moved out in August", () => {
  const statement = statementFor(tenantD.accountId);

  it("gets 8/12 of the share and 8 months of estimates", () => {
    expect(rowsOf(statement)).toEqual([
      ["CAM", 8, 1337, 114_895, 104_000, 10_895],
      ["Taxes", 8, 1337, 298_951, 300_000, -1_049],
      ["Insurance", 8, 1337, 56_007, 44_000, 12_007],
    ]);
  });

  it("has a true-up and no continuing terms", () => {
    expect(statement.countedMonths).toHaveLength(8);
    expect(statement.trueUpCents).toBe(21_853);
    expect(statement.priorBalanceCents).toBe(0);
    expect(statement.balanceOnAccountCents).toBe(21_853);
    expect(statement.continuing).toBeNull();
    expect(statement.data?.continuing).toBeNull();
  });
});

describe("6.3 Tenant B, a renewal on one account, with a credit", () => {
  const statement = statementFor(tenantB.accountId);

  it("counts each month once and adds estimates under both leases", () => {
    expect(rowsOf(statement)).toEqual([
      ["CAM", 12, 2139, 275_747, 271_000, 4_747],
      ["Taxes", 12, 2139, 717_483, 753_000, -35_517],
      ["Insurance", 12, 2139, 134_417, 111_500, 22_917],
      ["Water", 12, 4598, 86_399, 187_000, -100_601],
    ]);
  });

  it("gives a credit true-up and credit balance", () => {
    expect(statement.trueUpCents).toBe(-108_454);
    expect(statement.priorBalanceCents).toBe(25_000);
    expect(statement.balanceOnAccountCents).toBe(-83_454);
  });

  it("puts new estimates on B2 and leaves out the insurance request", () => {
    expect(statement.continuing?.leaseId).toBe("lease-b2");
    expect(
      statement.continuing?.newEstimates.map((e) => [e.name, e.amountCents]),
    ).toEqual([
      ["CAM", 22_979],
      ["Taxes", 59_790],
      ["Insurance", 11_201],
      ["Water", 7_200],
    ]);
    expect(statement.continuing?.baseRentCents).toBe(315_000);
    expect(statement.continuing?.newMonthlyRentCents).toBe(416_170);
    expect(statement.continuing?.insuranceRequest).toBe(false);
  });

  it("lists the June 2025 base rent step with the new monthly rent", () => {
    expect(statement.data?.continuing?.rentIncreases).toEqual([
      {
        effectiveOn: "2025-06-01",
        fromCents: 315_000,
        toCents: 324_450,
        newMonthlyRentCents: 416_170 + 9_450,
      },
    ]);
  });

  it("shows the building and water areas", () => {
    expect(statement.data?.buildingSqft).toBe(9350);
    expect(statement.data?.otherPoolAreas).toEqual([
      { name: "Water", sqft: 4350 },
    ]);
    expect(statement.data?.unit.sqft).toBe(2000);
  });
});

describe("which accounts get a statement", () => {
  it("gives one statement to each account that paid a pool, vacant units still counting", () => {
    const result = workspace();
    expect(result.statements.map((s) => s.unitLabel)).toEqual(["A", "B", "D"]);
    expect(result.pools.find((p) => p.poolId === POOLS.cam)?.poolSqft).toBe(
      9350,
    );
  });

  it("leaves out an account that paid no pool", () => {
    const noPools: AccountTerms = {
      ...superLucky,
      accountId: "account-no-pools",
      unitId: "unit-c",
      leases: superLucky.leases.map((lease) => ({
        ...lease,
        estimateSteps: [],
      })),
    };
    const result = workspace({ accounts: [noPools] });
    expect(result.statements).toEqual([]);
  });

  it("gives a tenant with two accounts two statements", () => {
    const second: AccountTerms = {
      ...tenantD,
      accountId: "account-b-second",
      tenantId: tenantB.tenantId,
    };
    const result = workspace({ accounts: [tenantB, second] });
    expect(result.statements.map((s) => [s.businessName, s.fileName])).toEqual([
      ["Tenant B Inc", "2024 Reconciliation Tenant B Inc B.pdf"],
      ["Tenant B Inc", "2024 Reconciliation Tenant B Inc D.pdf"],
    ]);
  });
});

function waterLease(startsOn: string): LeaseTerms {
  const base = superLucky.leases[0];
  if (!base) throw new Error("missing lease");
  return {
    ...base,
    estimateSteps: [
      { id: "water", poolId: POOLS.water, startsOn, amountCents: 5_000 },
    ],
  };
}

describe("pool months (6.4)", () => {
  function waterRow(startsOn: string) {
    const account: AccountTerms = {
      ...superLucky,
      unitId: "unit-b",
      leases: [waterLease(startsOn)],
    };
    const statement = workspace({ accounts: [account] }).statements[0];
    return statement?.rows[0];
  }

  it("counts Water for 6 months from a July 1 step", () => {
    const row = waterRow("2024-07-01");
    expect(row?.months).toBe(6);
    expect(row?.estimatesCents).toBe(30_000);
    expect(row?.partCents).toBe(43_199);
  });

  it("counts Water for 5 months from a July 15 step", () => {
    const row = waterRow("2024-07-15");
    expect(row?.months).toBe(5);
    expect(row?.estimatesCents).toBe(25_000);
  });

  it("uses a full year's share for the new estimate", () => {
    const account: AccountTerms = {
      ...superLucky,
      unitId: "unit-b",
      leases: [waterLease("2024-07-01")],
    };
    const statement = workspace({ accounts: [account] }).statements[0];
    expect(statement?.continuing?.newEstimates[0]?.amountCents).toBe(7_200);
  });

  it("counts March to December for a lease starting March 20", () => {
    const base = superLucky.leases[0];
    if (!base) throw new Error("missing lease");
    const account: AccountTerms = {
      ...superLucky,
      leases: [
        {
          ...base,
          startDate: "2024-03-20",
          rentSteps: base.rentSteps.map((step) => ({
            ...step,
            startsOn: "2024-03-20",
          })),
          estimateSteps: base.estimateSteps.map((step) => ({
            ...step,
            startsOn: "2024-03-20",
          })),
        },
      ],
    };
    const statement = workspace({ accounts: [account] }).statements[0];
    expect(statement?.countedMonths).toHaveLength(10);
    expect(statement?.rows.map((row) => row.months)).toEqual([10, 10, 10]);
    expect(statement?.rows[0]?.estimatesCents).toBe(268_610);
  });

  it("counts April to December when tracking starts April 1", () => {
    const statement = statementFor(superLucky.accountId, {
      trackingStart: "2024-04-01",
    });
    expect(statement.rows.map((row) => row.months)).toEqual([9, 9, 9]);
  });
});

function luckyWithWaterFrom2025(): AccountTerms {
  const base = superLucky.leases[0];
  if (!base) throw new Error("missing lease");
  return {
    ...superLucky,
    leases: [
      {
        ...base,
        estimateSteps: [
          ...base.estimateSteps,
          {
            id: "lucky-water-2025",
            poolId: POOLS.water,
            startsOn: "2025-01-01",
            amountCents: 0,
          },
        ],
      },
    ],
  };
}

function waterRefund(amountCents: number): Txn {
  return {
    ...EXPENSES[0],
    id: "water-refund",
    postedOn: "2024-12-01",
    amountCents,
    lines: [{ accountId: null, categoryId: CATEGORY_IDS.water, amountCents }],
  } as Txn;
}

describe("edge cases", () => {
  it("gives a pool with zero actual cost a row with part 0", () => {
    const statement = statementFor(superLucky.accountId, {
      transactions: [
        ...TRANSACTIONS,
        ...EXPENSES.filter((txn) => !txn.id.startsWith("ins")),
      ],
    });
    const row = statement.rows.find((r) => r.poolId === POOLS.insurance);
    expect(row?.partCents).toBe(0);
    expect(row?.balanceCents).toBe(-130_320);
    expect(
      statement.continuing?.newEstimates.find(
        (e) => e.poolId === POOLS.insurance,
      )?.amountCents,
    ).toBe(0);
  });

  it("does not throw for a zero-sqft pool and blocks with no amounts", () => {
    const pools = POOL_LIST.map((pool) =>
      pool.id === POOLS.water ? { ...pool, unitIds: [] } : pool,
    );
    const result = workspace({ pools });
    const water = result.pools.find((p) => p.poolId === POOLS.water);
    expect(water?.poolSqft).toBe(0);
    expect(water?.costPerSqftYearCents).toBeNull();
    const b = result.statements.find((s) => s.accountId === tenantB.accountId);
    const row = b?.rows.find((r) => r.poolId === POOLS.water);
    expect(row?.partCents).toBeNull();
    expect(row?.balanceCents).toBeNull();
    expect(row?.estimatesCents).toBe(187_000);
    expect(b?.trueUpCents).toBeNull();
    expect(b?.balanceOnAccountCents).toBeNull();
    expect(b?.continuing?.newMonthlyRentCents).toBeNull();
    expect(b?.data).toBeNull();
    expect(result.checklist).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        code: "pool_has_no_units",
        poolId: POOLS.water,
      }),
    );
    expect(result.canFinalize).toBe(false);
  });

  it("does not block on a zero-sqft pool no statement uses", () => {
    const pools = POOL_LIST.map((pool) =>
      pool.id === POOLS.water ? { ...pool, unitIds: [] } : pool,
    );
    expect(
      workspace({ pools, accounts: [superLucky, tenantD] }).checklist,
    ).toEqual([]);
  });

  it("blocks a negative actual cost", () => {
    const refund: Txn = {
      ...EXPENSES[0],
      id: "big-refund",
      postedOn: "2024-12-01",
      amountCents: 2_000_000,
      lines: [
        {
          accountId: null,
          categoryId: CATEGORY_IDS.cam,
          amountCents: 2_000_000,
        },
      ],
    } as Txn;
    const result = workspace({
      transactions: [...TRANSACTIONS, ...EXPENSES, refund],
    });
    expect(result.pools[0]?.actualCents).toBe(-710_881);
    expect(result.checklist).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        code: "negative_actual",
        poolId: POOLS.cam,
      }),
    );
    expect(result.canFinalize).toBe(false);
  });

  it("blocks a pool with no units that only the next year's lease pays", () => {
    const pools = POOL_LIST.map((pool) =>
      pool.id === POOLS.water ? { ...pool, unitIds: [] } : pool,
    );
    const result = workspace({
      pools,
      accounts: [luckyWithWaterFrom2025()],
    });
    const lucky = result.statements[0];
    expect(lucky?.rows.map((row) => row.poolId)).not.toContain(POOLS.water);
    expect(lucky?.data).toBeNull();
    expect(
      result.checklist.filter((item) => item.severity === "blocker"),
    ).toEqual([
      expect.objectContaining({
        code: "pool_has_no_units",
        poolId: POOLS.water,
      }),
      expect.objectContaining({
        code: "statement_incomplete",
        accountId: superLucky.accountId,
        message:
          "The statement for Super Lucky LLC (unit A) cannot be computed yet.",
      }),
    ]);
    expect(result.canFinalize).toBe(false);
  });

  it("blocks a negative actual cost that only the next year's lease pays", () => {
    const pools = POOL_LIST.map((pool) =>
      pool.id === POOLS.water
        ? { ...pool, unitIds: [...pool.unitIds, "unit-a"] }
        : pool,
    );
    const input = {
      pools,
      accounts: [luckyWithWaterFrom2025()],
      transactions: [...TRANSACTIONS, ...EXPENSES, waterRefund(300_000)],
    };
    const result = workspace(input);
    expect(
      result.statements[0]?.continuing?.newEstimates.find(
        (e) => e.poolId === POOLS.water,
      )?.amountCents,
    ).toBeLessThan(0);
    expect(result.checklist).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        code: "negative_actual",
        poolId: POOLS.water,
      }),
    );
    expect(result.canFinalize).toBe(false);
    expect(() => planFor(input)).toThrow(
      "The Water cost for 2024 is -$1,120.83",
    );
  });

  it("uses today's balance during a dry run", () => {
    const statement = statementFor(superLucky.accountId, {
      today: "2024-11-16",
    });
    expect(statement.priorBalanceAsOf).toBe("2024-11-16");
    expect(statement.priorBalanceCents).toBe(0);
    expect(statement.balanceOnAccountCents).toBe(23_774);
  });

  it("stops the dry-run balance at the newest bank date when it is before today", () => {
    const transactions = [...TRANSACTIONS, ...EXPENSES].filter(
      (txn) => txn.postedOn <= "2024-10-02",
    );
    const result = workspace({ today: "2024-11-16", transactions });
    const statement = result.statements.find(
      (s) => s.accountId === superLucky.accountId,
    );
    expect(result.newestBankDate).toBe("2024-10-02");
    expect(result.priorBalanceAsOf).toBe("2024-10-02");
    expect(statement?.priorBalanceAsOf).toBe("2024-10-02");
    expect(statement?.priorBalanceCents).toBe(0);
  });

  it("uses December 31 for the balance after the year ends, whatever the bank date", () => {
    const transactions = [...TRANSACTIONS, ...EXPENSES].filter(
      (txn) => txn.postedOn <= "2024-10-02",
    );
    const result = workspace({ today: "2025-01-10", transactions });
    expect(result.priorBalanceAsOf).toBe("2024-12-31");
    expect(
      result.statements.find((s) => s.accountId === superLucky.accountId)
        ?.priorBalanceAsOf,
    ).toBe("2024-12-31");
  });

  it("counts ledger entries through December 31 only", () => {
    const statement = statementFor(superLucky.accountId, {
      entries: [
        {
          id: "fee",
          propertyId: "property-2024",
          accountId: superLucky.accountId,
          kind: "adjustment",
          entryDate: "2024-12-20",
          amountCents: 5_000,
          note: "Key",
          feeMonth: null,
          reconciliationYearId: null,
        },
        {
          id: "later",
          propertyId: "property-2024",
          accountId: superLucky.accountId,
          kind: "adjustment",
          entryDate: "2025-01-02",
          amountCents: 7_000,
          note: "Later",
          feeMonth: null,
          reconciliationYearId: null,
        },
      ],
    });
    expect(statement.priorBalanceCents).toBe(46_374);
  });

  it("uses today as the preview letter date when none is set", () => {
    const result = workspace({ record: null });
    expect(result.letterDate).toBeNull();
    expect(result.previewLetterDate).toBe("2025-01-08");
    expect(result.statements[0]?.data?.letterDate).toBe("2025-01-08");
    expect(result.status).toBe("draft");
  });
});

describe("checklist (5.10)", () => {
  it("is clear for the section 6 data and allows finalize", () => {
    const result = workspace();
    expect(result.checklist).toEqual([]);
    expect(result.gates).toEqual({
      draft: true,
      previousYearFinalized: true,
      letterDateAfterYearEnd: true,
      todayAfterYearEnd: true,
    });
    expect(result.canFinalize).toBe(true);
  });

  it("blocks unsorted transactions dated in the year only", () => {
    const unsorted = (id: string, postedOn: string): Txn =>
      ({
        ...TRANSACTIONS[0],
        id,
        postedOn,
        lines: [],
      }) as Txn;
    const result = workspace({
      transactions: [
        ...TRANSACTIONS,
        ...EXPENSES,
        unsorted("u1", "2024-05-01"),
        unsorted("u2", "2024-12-31"),
        unsorted("u3", "2025-01-02"),
      ],
    });
    expect(result.checklist).toEqual([
      expect.objectContaining({
        severity: "blocker",
        code: "unsorted_transactions",
        count: 2,
        message: "2 transactions dated in 2024 still need sorting.",
      }),
    ]);
  });

  it("blocks a statement unit that is not in a pool it pays", () => {
    const pools = POOL_LIST.map((pool) =>
      pool.id === POOLS.cam
        ? { ...pool, unitIds: pool.unitIds.filter((id) => id !== "unit-a") }
        : pool,
    );
    expect(workspace({ pools }).checklist).toContainEqual(
      expect.objectContaining({
        code: "unit_not_in_pool",
        accountId: superLucky.accountId,
        poolId: POOLS.cam,
      }),
    );
  });

  it("does not add unit_not_in_pool for a pool with no units", () => {
    const pools = POOL_LIST.map((pool) =>
      pool.id === POOLS.water ? { ...pool, unitIds: [] } : pool,
    );
    const items = workspace({ pools }).checklist;
    expect(items.map((item) => item.code)).toContain("pool_has_no_units");
    expect(items.map((item) => item.code)).not.toContain("unit_not_in_pool");
  });

  it("treats blank letter details and a blank street or city as missing", () => {
    const blankAddress = (street1: string, city: string) =>
      TENANTS.map((tenant) =>
        tenant.id === tenantD.tenantId && tenant.mailingAddress
          ? {
              ...tenant,
              mailingAddress: { ...tenant.mailingAddress, street1, city },
            }
          : tenant,
      );
    for (const tenants of [
      blankAddress("  ", "Springfield"),
      blankAddress("1 Elm St", " "),
    ]) {
      expect(
        workspace({
          letter: { ...LETTER, ownerName: " ", ownerTitle: "\t" },
          tenants,
        }).checklist,
      ).toEqual([
        expect.objectContaining({
          code: "missing_letter_details",
          fields: ["owner name", "owner title"],
        }),
        expect.objectContaining({
          code: "missing_mailing_address",
          tenantId: tenantD.tenantId,
        }),
      ]);
    }
  });

  it("blocks missing letter details and mailing addresses", () => {
    const result = workspace({
      letter: { ...LETTER, ownerPhone: null, ownerEmail: "  " },
      tenants: TENANTS.map((tenant) =>
        tenant.id === tenantD.tenantId
          ? { ...tenant, mailingAddress: null }
          : tenant,
      ),
    });
    expect(result.checklist).toEqual([
      expect.objectContaining({
        severity: "blocker",
        code: "missing_letter_details",
        fields: ["phone", "email"],
      }),
      expect.objectContaining({
        severity: "blocker",
        code: "missing_mailing_address",
        tenantId: tenantD.tenantId,
        message: "Tenant D Co has no mailing address.",
      }),
    ]);
    expect(result.canFinalize).toBe(false);
  });

  it("warns when a pool had a bill amount last year but none this year", () => {
    expect(
      codes({ overrides: [override(POOLS.taxes, 3_000_000, 2023)] }),
    ).toEqual([["warning", "bill_amount_missing"]]);
    expect(
      codes({
        overrides: [
          override(POOLS.taxes, 3_000_000, 2023),
          override(POOLS.taxes, 3_354_231, 2024),
        ],
      }),
    ).toEqual([]);
  });

  it("warns about an account in holdover", () => {
    const base = superLucky.leases[0];
    if (!base) throw new Error("missing lease");
    const holdover: AccountTerms = {
      ...superLucky,
      leases: [{ ...base, endDate: "2024-09-30" }],
    };
    const result = workspace({ accounts: [holdover] });
    expect(result.statements[0]?.holdover).toBe(true);
    expect(result.statements[0]?.countedMonths).toHaveLength(12);
    expect(result.statements[0]?.continuing?.leaseId).toBe("lease-super-lucky");
    expect(result.checklist).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "holdover",
        accountId: superLucky.accountId,
      }),
    ]);
    expect(result.canFinalize).toBe(true);
  });

  it("warns when bank data stops before December 31", () => {
    const result = workspace({
      today: "2024-11-16",
      transactions: [...TRANSACTIONS, ...EXPENSES].filter(
        (txn) => txn.postedOn <= "2024-11-05",
      ),
    });
    expect(result.newestBankDate).toBe("2024-11-05");
    expect(result.checklist).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "bank_data_through",
        date: "2024-11-05",
        message: "Bank data only through November 5, 2024.",
      }),
    ]);
    expect(result.gates.todayAfterYearEnd).toBe(false);
    expect(result.canFinalize).toBe(false);
  });

  it("warns when no bank data is imported", () => {
    const result = workspace({ transactions: [] });
    expect(result.checklist).toContainEqual(
      expect.objectContaining({ code: "bank_data_through", date: null }),
    );
  });

  it("warns when pool members or unit sqft changed during or after the year", () => {
    const result = workspace({
      pools: POOL_LIST.map((pool) =>
        pool.id === POOLS.water
          ? { ...pool, membersChangedOn: "2024-03-01" }
          : pool.id === POOLS.cam
            ? { ...pool, membersChangedOn: "2023-12-31" }
            : pool,
      ),
      units: RECONCILIATION_UNITS.map((unit) =>
        unit.id === "unit-c" ? { ...unit, sqftChangedOn: "2025-01-05" } : unit,
      ),
    });
    expect(result.checklist).toEqual([
      expect.objectContaining({
        code: "pool_members_changed",
        poolId: POOLS.water,
        date: "2024-03-01",
      }),
      expect.objectContaining({
        code: "unit_sqft_changed",
        unitId: "unit-c",
        date: "2025-01-05",
      }),
    ]);
  });

  it("needs a draft year, a letter date after December 31, and today after December 31", () => {
    const record = reconciliationInput().record;
    if (!record) throw new Error("missing record");
    expect(
      workspace({ record: { ...record, letterDate: "2024-12-31" } }).gates,
    ).toMatchObject({ letterDateAfterYearEnd: false });
    expect(workspace({ record: null }).canFinalize).toBe(false);
    const finalized = workspace({
      record: { ...record, status: "finalized", finalizedAt: new Date() },
    });
    expect(finalized.gates.draft).toBe(false);
    expect(finalized.canFinalize).toBe(false);
  });

  it("needs the previous year finalized unless the year is the first one", () => {
    const record = reconciliationInput().record;
    if (!record) throw new Error("missing record");
    const nextYear = {
      year: 2025,
      today: "2026-01-08",
      record: {
        ...record,
        id: "year-2025",
        year: 2025,
        letterDate: "2026-01-02",
      },
    };
    const waiting = workspace(nextYear);
    expect(waiting.gates.previousYearFinalized).toBe(false);
    expect(waiting.canFinalize).toBe(false);
    expect(finalizeBlockers(waiting)).toContain("Finalize 2024 first.");

    const ready = workspace({ ...nextYear, finalizedYears: [2024] });
    expect(ready.gates.previousYearFinalized).toBe(true);
    expect(finalizeBlockers(ready)).not.toContain("Finalize 2024 first.");

    const firstYear = workspace({
      ...nextYear,
      trackingStart: "2024-04-01",
    });
    expect(firstYear.gates.previousYearFinalized).toBe(true);
  });

  it("keeps all section 6 accounts in ACCOUNTS", () => {
    expect(ACCOUNTS).toHaveLength(3);
  });
});

const FINALIZED_AT = new Date("2025-01-08T15:00:00Z");

function planFor(overrides: Partial<ReconciliationInput> = {}) {
  const input = reconciliationInput(overrides);
  if (!input.record) throw new Error("missing record");
  let next = 0;
  return finalizePlan({
    propertyId: "property-2024",
    record: input.record,
    workspace: reconciliationWorkspace(input),
    createdAt: FINALIZED_AT,
    newId: () => `id-${++next}`,
  });
}

function applyPlan(
  input: ReconciliationInput,
  plan: FinalizePlan,
): ReconciliationInput {
  if (!input.record) throw new Error("missing record");
  const accounts = input.accounts.map((account) => {
    const steps = plan.statements.find(
      (s) => s.accountId === account.accountId,
    )?.estimateSteps;
    return {
      ...account,
      leases: account.leases.map((lease) => ({
        ...lease,
        estimateSteps: [
          ...lease.estimateSteps.filter(
            (step) =>
              !steps?.some(
                (s) =>
                  s.leaseId === lease.leaseId &&
                  s.poolId === step.poolId &&
                  s.startsOn === step.startsOn,
              ),
          ),
          ...(steps ?? [])
            .filter((s) => s.leaseId === lease.leaseId)
            .map((s) => ({
              id: `${s.leaseId}-${s.poolId}-${s.startsOn}`,
              poolId: s.poolId,
              startsOn: s.startsOn,
              amountCents: s.amountCents,
            })),
        ],
      })),
    };
  });
  return {
    ...input,
    record: {
      ...input.record,
      status: "finalized",
      finalizedAt: FINALIZED_AT,
    },
    accounts,
    entries: [
      ...input.entries,
      ...plan.statements.flatMap((s) => (s.trueUp ? [s.trueUp] : [])),
    ],
  };
}

function snapshotsOf(plan: FinalizePlan): StatementSnapshot[] {
  return plan.statements.map((s) => s.snapshot);
}

function januaryPayment(
  accountId: string,
  postedOn: string,
  amountCents: number,
): Txn {
  return {
    id: `jan-${accountId}-${postedOn}`,
    propertyId: "property-2024",
    source: "bank",
    importBatchId: "batch-2025",
    postedOn,
    description: "JANUARY RENT",
    descriptionKey: "january rent",
    amountCents,
    externalId: null,
    lines: [{ accountId, categoryId: null, amountCents }],
  };
}

describe("finalize plan (5.11)", () => {
  const plan = planFor();

  it("writes one snapshot per statement with its PDF key", () => {
    expect(plan.year).toBe(2024);
    expect(plan.letterDate).toBe("2025-01-01");
    expect(
      plan.statements.map((s) => [
        s.accountId,
        s.fileName,
        s.snapshot.pdfStorageKey,
        s.snapshot.trueUpCents,
        s.snapshot.balanceOnAccountCents,
      ]),
    ).toEqual([
      [
        superLucky.accountId,
        "2024 Reconciliation Super Lucky LLC A.pdf",
        "reconciliations/property-2024/2024/account-super-lucky.pdf",
        23_774,
        65_148,
      ],
      [
        tenantB.accountId,
        "2024 Reconciliation Tenant B Inc B.pdf",
        "reconciliations/property-2024/2024/account-tenant-b.pdf",
        -108_454,
        -83_454,
      ],
      [
        tenantD.accountId,
        "2024 Reconciliation Tenant D Co D.pdf",
        "reconciliations/property-2024/2024/account-tenant-d.pdf",
        21_853,
        21_853,
      ],
    ]);
    expect(plan.statements[0]?.snapshot).toMatchObject({
      propertyId: "property-2024",
      reconciliationYearId: "year-2024",
      year: 2024,
      tenantId: superLucky.tenantId,
      createdAt: FINALIZED_AT,
    });
    expect(plan.statements[0]?.snapshot.data).toBe(plan.statements[0]?.data);
    expect(plan.statements[0]?.data.letterDate).toBe("2025-01-01");
  });

  it("dates each true-up on the letter date", () => {
    expect(
      plan.statements.map((s) => [
        s.trueUp?.accountId,
        s.trueUp?.kind,
        s.trueUp?.entryDate,
        s.trueUp?.amountCents,
        s.trueUp?.reconciliationYearId,
      ]),
    ).toEqual([
      [superLucky.accountId, "true_up", "2025-01-01", 23_774, "year-2024"],
      [tenantB.accountId, "true_up", "2025-01-01", -108_454, "year-2024"],
      [tenantD.accountId, "true_up", "2025-01-01", 21_853, "year-2024"],
    ]);
  });

  it("sets seven estimate steps from January 1 on the lease covering it", () => {
    expect(
      plan.statements.map((s) =>
        s.estimateSteps.map((step) => [
          step.leaseId,
          step.poolId,
          step.startsOn,
          step.amountCents,
        ]),
      ),
    ).toEqual([
      [
        ["lease-super-lucky", POOLS.cam, "2025-01-01", 28_724],
        ["lease-super-lucky", POOLS.taxes, "2025-01-01", 74_738],
        ["lease-super-lucky", POOLS.insurance, "2025-01-01", 14_002],
      ],
      [
        ["lease-b2", POOLS.cam, "2025-01-01", 22_979],
        ["lease-b2", POOLS.taxes, "2025-01-01", 59_790],
        ["lease-b2", POOLS.insurance, "2025-01-01", 11_201],
        ["lease-b2", POOLS.water, "2025-01-01", 7_200],
      ],
      [],
    ]);
  });

  it("stores the new monthly rent the letter states", () => {
    expect(
      plan.statements.map(
        (s) => s.snapshot.data.continuing?.newMonthlyRentCents ?? null,
      ),
    ).toEqual([367_464, 416_170, null]);
  });

  it("writes no true-up when it is 0", () => {
    const input = reconciliationInput();
    if (!input.record) throw new Error("missing record");
    const workspaceNow = reconciliationWorkspace(input);
    const zeroed = {
      ...workspaceNow,
      statements: workspaceNow.statements.map((s) => ({
        ...s,
        trueUpCents: 0,
      })),
    };
    const result = finalizePlan({
      propertyId: "property-2024",
      record: input.record,
      workspace: zeroed,
      createdAt: FINALIZED_AT,
      newId: () => "id",
    });
    expect(result.statements.map((s) => s.trueUp)).toEqual([null, null, null]);
  });

  it("uses a renewal that starts on January 1 and leaves a later lease alone", () => {
    const b2 = tenantB.leases[1];
    if (!b2) throw new Error("missing lease");
    const renewal = (startDate: string): AccountTerms => ({
      ...tenantB,
      leases: [
        ...tenantB.leases.slice(0, 1),
        { ...b2, endDate: "2024-12-31" },
        {
          ...b2,
          leaseId: "lease-b3",
          startDate,
          endDate: "2027-12-31",
          rentSteps: [
            {
              id: "b3-rent",
              startsOn: startDate,
              amountCents: 330_000,
              tenantNotifiedAt: null,
            },
          ],
          estimateSteps: b2.estimateSteps.map((step) => ({
            ...step,
            id: `b3-${step.poolId}`,
            startsOn: startDate,
          })),
        },
      ],
    });

    const onJanuary1 = planFor({ accounts: [renewal("2025-01-01")] });
    expect(
      onJanuary1.statements[0]?.estimateSteps.map((s) => s.leaseId),
    ).toEqual(["lease-b3", "lease-b3", "lease-b3", "lease-b3"]);
    expect(onJanuary1.statements[0]?.data.continuing?.baseRentCents).toBe(
      330_000,
    );

    const later = planFor({ accounts: [renewal("2025-02-01")] });
    expect(later.statements[0]?.estimateSteps.map((s) => s.leaseId)).toEqual([
      "lease-b2",
      "lease-b2",
      "lease-b2",
      "lease-b2",
    ]);
  });

  function renewalFromJanuary1(estimateSteps: LeaseTerms["estimateSteps"]) {
    const b2 = tenantB.leases[1];
    if (!b2) throw new Error("missing lease");
    return {
      ...tenantB,
      leases: [
        ...tenantB.leases.slice(0, 1),
        { ...b2, endDate: "2024-12-31" },
        {
          ...b2,
          leaseId: "lease-b3",
          startDate: "2025-01-01",
          endDate: "2027-12-31",
          rentSteps: [
            {
              id: "b3-rent",
              startsOn: "2025-01-01",
              amountCents: 330_000,
              tenantNotifiedAt: null,
            },
          ],
          estimateSteps,
        },
      ],
    };
  }

  it("carries every pool paid in December onto a January 1 renewal entered with no estimates", () => {
    const accounts = [renewalFromJanuary1([])];
    const result = workspace({ accounts });
    expect(result.canFinalize).toBe(true);
    expect(
      result.checklist.map((item) => [item.severity, item.code, item.message]),
    ).toEqual([
      [
        "warning",
        "estimate_carried_over",
        "Tenant B Inc's lease from January 1, 2025 has no CAM estimate; finalize will add $229.79.",
      ],
      [
        "warning",
        "estimate_carried_over",
        "Tenant B Inc's lease from January 1, 2025 has no Taxes estimate; finalize will add $597.90.",
      ],
      [
        "warning",
        "estimate_carried_over",
        "Tenant B Inc's lease from January 1, 2025 has no Insurance estimate; finalize will add $112.01.",
      ],
      [
        "warning",
        "estimate_carried_over",
        "Tenant B Inc's lease from January 1, 2025 has no Water estimate; finalize will add $72.00.",
      ],
    ]);

    const plan = planFor({ accounts });
    expect(
      plan.statements[0]?.estimateSteps.map((step) => [
        step.leaseId,
        step.poolId,
        step.startsOn,
        step.amountCents,
      ]),
    ).toEqual([
      ["lease-b3", POOLS.cam, "2025-01-01", 22_979],
      ["lease-b3", POOLS.taxes, "2025-01-01", 59_790],
      ["lease-b3", POOLS.insurance, "2025-01-01", 11_201],
      ["lease-b3", POOLS.water, "2025-01-01", 7_200],
    ]);
    expect(plan.statements[0]?.data.continuing).toMatchObject({
      baseRentCents: 330_000,
      newMonthlyRentCents: 431_170,
    });
    expect(
      plan.statements[0]?.data.continuing?.newEstimates.map((e) => e.name),
    ).toEqual(["CAM", "Taxes", "Insurance", "Water"]);
  });

  it("carries only the pools a January 1 renewal leaves out", () => {
    const accounts = [
      renewalFromJanuary1([
        {
          id: "b3-cam",
          poolId: POOLS.cam,
          startsOn: "2025-01-01",
          amountCents: 23_500,
        },
      ]),
    ];
    const statement = workspace({ accounts }).statements[0];
    expect(
      statement?.continuing?.newEstimates.map((e) => [e.name, e.carriedOver]),
    ).toEqual([
      ["CAM", false],
      ["Taxes", true],
      ["Insurance", true],
      ["Water", true],
    ]);
    expect(planFor({ accounts }).statements[0]?.estimateSteps).toHaveLength(4);
  });

  it("does not carry a pool whose units no longer include the unit", () => {
    const accounts = [renewalFromJanuary1([])];
    const pools = POOL_LIST.map((pool) =>
      pool.id === POOLS.water
        ? { ...pool, unitIds: pool.unitIds.filter((id) => id !== "unit-b") }
        : pool,
    );
    const statement = workspace({ accounts, pools }).statements[0];
    expect(statement?.continuing?.newEstimates.map((e) => e.name)).toEqual([
      "CAM",
      "Taxes",
      "Insurance",
    ]);
  });

  it("replaces a January 1 step the owner already typed without adding one", () => {
    const typed: AccountTerms = {
      ...superLucky,
      leases: superLucky.leases.map((lease) => ({
        ...lease,
        estimateSteps: [
          ...lease.estimateSteps,
          {
            id: "typed-cam-2025",
            poolId: POOLS.cam,
            startsOn: "2025-01-01",
            amountCents: 30_000,
          },
        ],
      })),
    };
    const input = reconciliationInput({ accounts: [typed] });
    const typedPlan = planFor({ accounts: [typed] });
    expect(
      typedPlan.statements[0]?.estimateSteps.map((step) => [
        step.poolId,
        step.startsOn,
        step.amountCents,
      ]),
    ).toEqual([
      [POOLS.cam, "2025-01-01", 28_724],
      [POOLS.taxes, "2025-01-01", 74_738],
      [POOLS.insurance, "2025-01-01", 14_002],
    ]);
    const after = applyPlan(input, typedPlan).accounts[0]?.leases[0];
    expect(after?.estimateSteps).toHaveLength(6);
    expect(
      after?.estimateSteps
        .filter((step) => step.poolId === POOLS.cam)
        .map((step) => [step.startsOn, step.amountCents]),
    ).toEqual([
      ["2023-01-01", 26_861],
      ["2025-01-01", 28_724],
    ]);
  });

  it("lists every gate and blocker that stops finalize", () => {
    const input = reconciliationInput();
    if (!input.record) throw new Error("missing record");
    const blocked = reconciliationWorkspace({
      ...input,
      today: "2024-12-31",
      record: { ...input.record, letterDate: null },
      letter: { ...LETTER, ownerPhone: null },
    });
    expect(finalizeBlockers(blocked)).toEqual([
      "Set the letter date.",
      "2024 can be finalized from January 1, 2025.",
      "Letter details are missing in Setup: phone.",
    ]);
    expect(finalizeBlockers(reconciliationWorkspace(input))).toEqual([]);
  });

  it("throws while a gate or blocker stands", () => {
    const record = reconciliationInput().record;
    if (!record) throw new Error("missing record");
    expect(() =>
      planFor({ record: { ...record, letterDate: "2024-12-31" } }),
    ).toThrow("The letter date must be after December 31, 2024.");
    expect(() => planFor({ today: "2024-12-31" })).toThrow(
      "2024 can be finalized from January 1, 2025.",
    );
    expect(() =>
      planFor({
        record: { ...record, status: "finalized", finalizedAt: new Date() },
      }),
    ).toThrow("2024 is already finalized.");
    expect(() =>
      planFor({
        transactions: [
          ...TRANSACTIONS,
          ...EXPENSES,
          {
            ...januaryPayment(superLucky.accountId, "2024-12-20", 100),
            lines: [],
          },
        ],
      }),
    ).toThrow("1 transaction dated in 2024 still needs sorting.");
  });
});

describe("finalized year: snapshots against current data (5.11)", () => {
  const plan = planFor();
  const finalizedInput = applyPlan(reconciliationInput(), plan);

  function comparisons(overrides: Partial<ReconciliationInput> = {}) {
    return compareSnapshots(
      snapshotsOf(plan),
      reconciliationWorkspace({ ...finalizedInput, ...overrides }).statements,
    );
  }

  it("matches right after finalize, true-ups and new steps included", () => {
    const result = comparisons();
    expect(result.map((c) => [c.unitLabel, c.matches])).toEqual([
      ["A", true],
      ["B", true],
      ["D", true],
    ]);
    expect(result.flatMap((c) => c.differences)).toEqual([]);
  });

  it("lists each changed value with its difference after a payment is re-sorted", () => {
    const december = TRANSACTIONS.find(
      (t) =>
        t.postedOn === "2024-12-01" &&
        t.lines[0]?.accountId === superLucky.accountId,
    );
    if (!december) throw new Error("missing payment");
    const result = comparisons({
      transactions: [
        ...TRANSACTIONS.filter((t) => t !== december),
        {
          ...december,
          lines: [
            {
              accountId: null,
              categoryId: CATEGORY_IDS.repairs,
              amountCents: december.amountCents,
            },
          ],
        },
        ...EXPENSES,
      ],
    });

    const superLuckyResult = result.find(
      (c) => c.accountId === superLucky.accountId,
    );
    expect(superLuckyResult?.matches).toBe(false);
    expect(superLuckyResult?.differences).toEqual([
      {
        label: "Rent balance",
        unit: "cents",
        snapshot: 41_374,
        now: 365_482,
        difference: 324_108,
        message: "Rent balance: $413.74, now $3,654.82 (+$3,241.08)",
      },
      {
        label: "Balance on account",
        unit: "cents",
        snapshot: 65_148,
        now: 389_256,
        difference: 324_108,
        message: "Balance on account: $651.48, now $3,892.56 (+$3,241.08)",
      },
    ]);
    expect(result.filter((c) => c.matches)).toHaveLength(2);
  });

  it("lists pool lines and the true-up when a cost changes, keeping the January 1 estimates finalize wrote", () => {
    const result = comparisons({
      transactions: [
        ...TRANSACTIONS,
        ...EXPENSES,
        {
          ...januaryPayment(superLucky.accountId, "2024-12-30", -93_500),
          lines: [
            {
              accountId: null,
              categoryId: CATEGORY_IDS.cam,
              amountCents: -93_500,
            },
          ],
        },
      ],
    });
    const messages = result
      .find((c) => c.accountId === superLucky.accountId)
      ?.differences.map((d) => d.message);
    expect(messages).toEqual([
      "CAM cost: $12,891.19, now $13,826.19 (+$935.00)",
      "CAM annual share: $3,446.84, now $3,696.84 (+$250.00)",
      "CAM balance due: $223.52, now $473.52 (+$250.00)",
      "True-up: $237.74, now $487.74 (+$250.00)",
      "Balance on account: $651.48, now $901.48 (+$250.00)",
    ]);
  });

  it("flags a change to a base rent step later in the next year", () => {
    const accounts = finalizedInput.accounts.map((account) =>
      account.accountId === tenantB.accountId
        ? {
            ...account,
            leases: account.leases.map((lease) => ({
              ...lease,
              rentSteps: lease.rentSteps.map((step) =>
                step.startsOn === "2025-06-01"
                  ? { ...step, amountCents: 330_000 }
                  : step,
              ),
            })),
          }
        : account,
    );
    const result = comparisons({ accounts }).find(
      (c) => c.accountId === tenantB.accountId,
    );
    expect(result?.differences.map((d) => d.message)).toEqual([
      "Base rent from June 1, 2025: $3,244.50, now $3,300.00 (+$55.50)",
      "Monthly rent from June 1, 2025: $4,256.20, now $4,311.70 (+$55.50)",
    ]);
  });

  it("reads a snapshot saved before rent increases were stored as having none", () => {
    const snapshots = snapshotsOf(plan).map((snapshot) => {
      const continuing = snapshot.data.continuing;
      if (!continuing) return snapshot;
      const { rentIncreases: _dropped, ...rest } = continuing;
      return { ...snapshot, data: { ...snapshot.data, continuing: rest } };
    });
    const result = compareSnapshots(
      snapshots,
      reconciliationWorkspace(finalizedInput).statements,
    ).find((c) => c.accountId === tenantB.accountId);
    expect(result?.differences.map((d) => d.message)).toEqual([
      "Base rent from June 1, 2025: none, now $3,244.50",
      "Monthly rent from June 1, 2025: none, now $4,256.20",
    ]);
  });

  function editSuperLucky(edit: (lease: LeaseTerms) => LeaseTerms) {
    return finalizedInput.accounts.map((account) =>
      account.accountId === superLucky.accountId
        ? { ...account, leases: account.leases.map(edit) }
        : account,
    );
  }

  function superLuckyMessages(accounts: AccountTerms[]) {
    const result = comparisons({ accounts }).find(
      (c) => c.accountId === superLucky.accountId,
    );
    expect(result?.matches).toBe(false);
    return result?.differences.map((d) => d.message);
  }

  it("flags a lease edit to an estimate step inside the year", () => {
    const messages = superLuckyMessages(
      editSuperLucky((lease) => ({
        ...lease,
        estimateSteps: [
          ...lease.estimateSteps,
          {
            id: "cam-july",
            poolId: POOLS.cam,
            startsOn: "2024-07-01",
            amountCents: 30_000,
          },
        ],
      })),
    );
    expect(messages).toEqual([
      "CAM estimates billed: $3,223.32, now $3,411.66 (+$188.34)",
      "CAM balance due: $223.52, now $35.18 (-$188.34)",
      "True-up: $237.74, now $49.40 (-$188.34)",
      "Rent balance: $413.74, now $602.08 (+$188.34)",
    ]);
  });

  it("flags a base rent change on January 1", () => {
    const messages = superLuckyMessages(
      editSuperLucky((lease) => ({
        ...lease,
        rentSteps: [
          ...lease.rentSteps,
          {
            id: "rent-2025",
            startsOn: "2025-01-01",
            amountCents: 260_000,
            tenantNotifiedAt: null,
          },
        ],
      })),
    );
    expect(messages).toEqual([
      "New monthly rent: $3,674.64, now $3,774.64 (+$100.00)",
    ]);
  });

  it("flags January 1 estimate steps that were removed or never saved", () => {
    const messages = superLuckyMessages(
      editSuperLucky((lease) => ({
        ...lease,
        estimateSteps: lease.estimateSteps.filter(
          (step) => step.startsOn !== "2025-01-01",
        ),
      })),
    );
    expect(messages).toEqual([
      "New CAM estimate: $287.24, now $268.61 (-$18.63)",
      "New Taxes estimate: $747.38, now $777.61 (+$30.23)",
      "New Insurance estimate: $140.02, now $108.60 (-$31.42)",
      "New monthly rent: $3,674.64, now $3,654.82 (-$19.82)",
    ]);
  });

  it("flags a change to the insurance request", () => {
    const messages = superLuckyMessages(
      editSuperLucky((lease) => ({
        ...lease,
        insuranceExpiresOn: "2025-11-30",
      })),
    );
    expect(messages).toEqual(["Insurance request: yes, now no"]);
  });

  it("flags an account whose statement is gone and a statement with no snapshot", () => {
    const noPools: AccountTerms = {
      ...tenantD,
      leases: tenantD.leases.map((lease) => ({ ...lease, estimateSteps: [] })),
    };
    const newcomer: AccountTerms = {
      ...superLucky,
      accountId: "account-newcomer",
      tenantId: tenantD.tenantId,
      unitId: "unit-e",
    };
    const result = comparisons({
      accounts: [
        ...finalizedInput.accounts.filter(
          (a) => a.accountId !== tenantD.accountId,
        ),
        noPools,
        newcomer,
      ],
    });
    const gone = result.find((c) => c.accountId === tenantD.accountId);
    expect(gone).toMatchObject({
      hasSnapshot: true,
      hasStatementNow: false,
      matches: false,
    });
    expect(gone?.differences.map((d) => d.message)).toContain(
      "True-up: $218.53, now none",
    );
    const added = result.find((c) => c.accountId === "account-newcomer");
    expect(added).toMatchObject({
      hasSnapshot: false,
      hasStatementNow: true,
      matches: false,
      unitLabel: "E",
    });
  });

  it("builds the finalized view with snapshots, comparisons, and the January table", () => {
    const view = finalizedYearView({
      workspace: reconciliationWorkspace(finalizedInput),
      snapshots: [
        ...snapshotsOf(plan),
        { ...snapshotsOf(plan)[0], year: 2023 } as StatementSnapshot,
      ],
      transactions: finalizedInput.transactions,
    });
    expect(view.snapshots.map((s) => [s.fileName, s.trueUpCents])).toEqual([
      ["2024 Reconciliation Super Lucky LLC A.pdf", 23_774],
      ["2024 Reconciliation Tenant B Inc B.pdf", -108_454],
      ["2024 Reconciliation Tenant D Co D.pdf", 21_853],
    ]);
    expect(view.mismatchCount).toBe(0);
    expect(view.january.month).toBe("2025-01");
  });
});

describe("January table (5.11)", () => {
  const plan = planFor();

  it("shows Super Lucky 19.82 short after paying the old amount", () => {
    const table = januaryTable({
      year: 2024,
      today: "2025-01-08",
      snapshots: snapshotsOf(plan),
      transactions: [
        ...TRANSACTIONS,
        ...EXPENSES,
        januaryPayment(superLucky.accountId, "2025-01-02", 365_482),
        januaryPayment(tenantB.accountId, "2025-01-03", 416_170),
        januaryPayment(tenantD.accountId, "2025-01-03", 21_853),
      ],
    });
    expect(table).toMatchObject({
      month: "2025-01",
      from: "2025-01-01",
      through: "2025-01-08",
    });
    expect(
      table.rows.map((row) => [
        row.unitLabel,
        row.newMonthlyRentCents,
        row.paidCents,
        row.shortCents,
      ]),
    ).toEqual([
      ["A", 367_464, 365_482, 1_982],
      ["B", 416_170, 416_170, 0],
    ]);
  });

  it("counts only January payments through the end of the month", () => {
    const table = januaryTable({
      year: 2024,
      today: "2025-03-01",
      snapshots: snapshotsOf(plan),
      transactions: [
        januaryPayment(superLucky.accountId, "2024-12-31", 100),
        januaryPayment(superLucky.accountId, "2025-01-31", 200_000),
        januaryPayment(superLucky.accountId, "2025-02-01", 167_464),
      ],
    });
    expect(table.through).toBe("2025-01-31");
    expect(table.rows[0]).toMatchObject({
      paidCents: 200_000,
      shortCents: 167_464,
    });
    expect(table.rows[1]).toMatchObject({ paidCents: 0, shortCents: 416_170 });
  });
});
