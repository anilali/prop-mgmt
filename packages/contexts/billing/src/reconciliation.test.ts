import { describe, expect, it } from "vitest";

import type { AccountStatement, ReconciliationInput } from "./reconciliation";
import type { AccountTerms, LeaseTerms, PoolBillOverride, Txn } from "./types";
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
import { reconciliationWorkspace } from "./reconciliation";

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
      effectiveDate: "2025-01-01",
      baseRentCents: 250_000,
      newEstimates: [
        {
          poolId: POOLS.cam,
          name: "CAM",
          letterName: "CAM",
          amountCents: 28_724,
        },
        {
          poolId: POOLS.taxes,
          name: "Taxes",
          letterName: "tax",
          amountCents: 74_738,
        },
        {
          poolId: POOLS.insurance,
          name: "Insurance",
          letterName: "insurance",
          amountCents: 14_002,
        },
      ],
      newMonthlyRentCents: 367_464,
      insuranceExpiresOn: "2024-11-30",
      insuranceRequest: true,
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

  it("uses today's balance during a dry run", () => {
    const statement = statementFor(superLucky.accountId, {
      today: "2024-11-16",
    });
    expect(statement.priorBalanceAsOf).toBe("2024-11-16");
    expect(statement.priorBalanceCents).toBe(0);
    expect(statement.balanceOnAccountCents).toBe(23_774);
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

  it("keeps all section 6 accounts in ACCOUNTS", () => {
    expect(ACCOUNTS).toHaveLength(3);
  });
});
