import type { Address, IsoDate, YearMonth } from "@moonship/shared";
import { formatCents, prorate } from "@moonship/shared";

import type { AccountLedger } from "./balance";
import type { StatementData } from "./statement-document";
import type {
  AccountTerms,
  Category,
  LedgerEntry,
  Pool,
  PoolBillOverride,
  ReconciliationStatus,
  ReconciliationYear,
  Txn,
} from "./types";
import { accountEntries, accountPayments, balanceOn } from "./balance";
import {
  countedMonths,
  coveringLease,
  dueDate,
  estimateOn,
  isHoldover,
  leaseForMonth,
  openOn,
  paysOn,
  rentOn,
} from "./lease-calendar";
import {
  costPerSqftMonthHundredths,
  costPerSqftYearCents,
  longDate,
  shareBps,
  statementFileName,
} from "./statement-document";

export interface ReconciliationUnit {
  id: string;
  label: string;
  sqft: number;
  sqftChangedOn: IsoDate | null;
  address: Address;
}

export interface ReconciliationTenant {
  id: string;
  businessName: string;
  mailingAddress: Address | null;
}

export interface ReconciliationLetterDetails {
  ownerName: string | null;
  ownerTitle: string | null;
  companyName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
}

export interface ReconciliationInput {
  year: number;
  today: IsoDate;
  trackingStart: IsoDate;
  propertyName: string;
  letter: ReconciliationLetterDetails;
  record: ReconciliationYear | null;
  units: readonly ReconciliationUnit[];
  tenants: readonly ReconciliationTenant[];
  accounts: readonly AccountTerms[];
  pools: readonly Pool[];
  categories: readonly Category[];
  transactions: readonly Txn[];
  entries: readonly LedgerEntry[];
  overrides: readonly PoolBillOverride[];
}

export interface PoolCostLine {
  transactionId: string;
  postedOn: IsoDate;
  description: string;
  source: Txn["source"];
  amountCents: number;
}

export interface PoolActual {
  poolId: string;
  name: string;
  letterName: string;
  categoryId: string | null;
  unitIds: string[];
  poolSqft: number;
  lines: PoolCostLine[];
  categoryTotalCents: number;
  billOverride: { amountCents: number; note: string } | null;
  actualCents: number;
  costPerSqftYearCents: number | null;
  costPerSqftMonthHundredths: number | null;
}

export interface StatementRow {
  poolId: string;
  name: string;
  letterName: string;
  poolSqft: number;
  unitInPool: boolean;
  shareBps: number | null;
  actualCents: number;
  billOverride: { amountCents: number; note: string } | null;
  months: number;
  partCents: number | null;
  estimatesCents: number;
  balanceCents: number | null;
}

export interface NewEstimate {
  poolId: string;
  name: string;
  letterName: string;
  amountCents: number | null;
}

export interface ContinuingTerms {
  leaseId: string;
  effectiveDate: IsoDate;
  baseRentCents: number;
  newEstimates: NewEstimate[];
  newMonthlyRentCents: number | null;
  insuranceExpiresOn: IsoDate | null;
  insuranceRequest: boolean;
}

export interface AccountStatement {
  accountId: string;
  tenantId: string;
  unitId: string;
  businessName: string;
  unitLabel: string;
  fileName: string;
  countedMonths: YearMonth[];
  rows: StatementRow[];
  trueUpCents: number | null;
  priorBalanceCents: number;
  priorBalanceAsOf: IsoDate;
  balanceOnAccountCents: number | null;
  continuing: ContinuingTerms | null;
  holdover: boolean;
  data: StatementData | null;
}

export type ChecklistCode =
  | "unsorted_transactions"
  | "pool_has_no_units"
  | "unit_not_in_pool"
  | "negative_actual"
  | "missing_letter_details"
  | "missing_mailing_address"
  | "bill_amount_missing"
  | "holdover"
  | "bank_data_through"
  | "pool_members_changed"
  | "unit_sqft_changed";

export interface ChecklistItem {
  severity: "blocker" | "warning";
  code: ChecklistCode;
  message: string;
  poolId?: string;
  accountId?: string;
  tenantId?: string;
  unitId?: string;
  count?: number;
  date?: IsoDate | null;
  fields?: string[];
}

export interface FinalizeGates {
  draft: boolean;
  letterDateAfterYearEnd: boolean;
  todayAfterYearEnd: boolean;
}

export interface ReconciliationWorkspace {
  year: number;
  status: ReconciliationStatus;
  letterDate: IsoDate | null;
  previewLetterDate: IsoDate;
  finalizedAt: Date | null;
  today: IsoDate;
  priorBalanceAsOf: IsoDate;
  newestBankDate: IsoDate | null;
  pools: PoolActual[];
  statements: AccountStatement[];
  checklist: ChecklistItem[];
  gates: FinalizeGates;
  canFinalize: boolean;
}

export function yearEnd(year: number): IsoDate {
  return `${year}-12-31`;
}

export function nextJanuary1(year: number): IsoDate {
  return `${year + 1}-01-01`;
}

function inYear(date: IsoDate, year: number): boolean {
  return date >= `${year}-01-01` && date <= yearEnd(year);
}

function sum(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

function sortedPools(pools: readonly Pool[]): Pool[] {
  return [...pools].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export function poolSqft(
  pool: Pool,
  units: readonly { id: string; sqft: number }[],
): number {
  return sum(
    units.filter((unit) => pool.unitIds.includes(unit.id)).map((u) => u.sqft),
  );
}

export function poolActuals(input: {
  year: number;
  pools: readonly Pool[];
  categories: readonly Category[];
  transactions: readonly Txn[];
  units: readonly { id: string; sqft: number }[];
  overrides: readonly PoolBillOverride[];
}): PoolActual[] {
  return sortedPools(input.pools).map((pool) => {
    const category = input.categories.find((c) => c.poolId === pool.id);
    const lines: PoolCostLine[] = category
      ? input.transactions
          .filter((txn) => inYear(txn.postedOn, input.year))
          .flatMap((txn) =>
            txn.lines
              .filter((line) => line.categoryId === category.id)
              .map((line) => ({
                transactionId: txn.id,
                postedOn: txn.postedOn,
                description: txn.description,
                source: txn.source,
                amountCents: line.amountCents,
              })),
          )
          .sort((a, b) =>
            a.postedOn < b.postedOn ? -1 : a.postedOn > b.postedOn ? 1 : 0,
          )
      : [];
    const categoryTotalCents = -sum(lines.map((line) => line.amountCents));
    const override = input.overrides.find(
      (o) => o.poolId === pool.id && o.year === input.year,
    );
    const billOverride = override
      ? { amountCents: override.amountCents, note: override.note }
      : null;
    const actualCents = billOverride?.amountCents ?? categoryTotalCents;
    const sqft = poolSqft(pool, input.units);
    return {
      poolId: pool.id,
      name: pool.name,
      letterName: pool.letterName,
      categoryId: category?.id ?? null,
      unitIds: [...pool.unitIds],
      poolSqft: sqft,
      lines,
      categoryTotalCents,
      billOverride,
      actualCents,
      costPerSqftYearCents:
        sqft > 0 ? costPerSqftYearCents(actualCents, sqft) : null,
      costPerSqftMonthHundredths:
        sqft > 0 ? costPerSqftMonthHundredths(actualCents, sqft) : null,
    };
  });
}

const EMPTY_ADDRESS: Address = {
  street1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

export function accountStatement(input: {
  year: number;
  today: IsoDate;
  trackingStart: IsoDate;
  account: AccountTerms;
  unit: ReconciliationUnit;
  tenant: ReconciliationTenant | null;
  pools: readonly PoolActual[];
  ledger: AccountLedger;
}): Omit<AccountStatement, "data"> | null {
  const { account, unit, year } = input;
  const months = countedMonths(
    account,
    input.trackingStart,
    `${year}-01`,
    `${year}-12`,
  );
  const paying = (month: YearMonth, poolId: string) =>
    paysOn(leaseForMonth(account, month), poolId, dueDate(account, month));

  const rows: StatementRow[] = input.pools.flatMap((pool) => {
    const poolMonths = months.filter((month) => paying(month, pool.poolId));
    if (poolMonths.length === 0) return [];
    const estimatesCents = sum(
      poolMonths.map(
        (month) =>
          estimateOn(
            leaseForMonth(account, month),
            pool.poolId,
            dueDate(account, month),
          ) ?? 0,
      ),
    );
    const partCents =
      pool.poolSqft > 0
        ? prorate(
            pool.actualCents,
            [unit.sqft, poolMonths.length],
            [pool.poolSqft, 12],
          )
        : null;
    return [
      {
        poolId: pool.poolId,
        name: pool.name,
        letterName: pool.letterName,
        poolSqft: pool.poolSqft,
        unitInPool: pool.unitIds.includes(unit.id),
        shareBps: pool.poolSqft > 0 ? shareBps(unit.sqft, pool.poolSqft) : null,
        actualCents: pool.actualCents,
        billOverride: pool.billOverride,
        months: poolMonths.length,
        partCents,
        estimatesCents,
        balanceCents: partCents === null ? null : partCents - estimatesCents,
      },
    ];
  });
  if (rows.length === 0) return null;

  const complete = rows.every((row) => row.balanceCents !== null);
  const trueUpCents = complete
    ? sum(rows.map((row) => row.balanceCents ?? 0))
    : null;
  const priorBalanceAsOf =
    input.today < yearEnd(year) ? input.today : yearEnd(year);
  const priorBalanceCents = balanceOn(input.ledger, priorBalanceAsOf);

  const jan1 = nextJanuary1(year);
  const nextLease = openOn(account, jan1) ? coveringLease(account, jan1) : null;
  let continuing: ContinuingTerms | null = null;
  if (nextLease) {
    const newEstimates: NewEstimate[] = input.pools
      .filter((pool) => paysOn(nextLease, pool.poolId, jan1))
      .map((pool) => ({
        poolId: pool.poolId,
        name: pool.name,
        letterName: pool.letterName,
        amountCents:
          pool.poolSqft > 0
            ? prorate(pool.actualCents, [unit.sqft], [pool.poolSqft, 12])
            : null,
      }));
    const baseRentCents = rentOn(nextLease, jan1);
    continuing = {
      leaseId: nextLease.leaseId,
      effectiveDate: jan1,
      baseRentCents,
      newEstimates,
      newMonthlyRentCents: newEstimates.every((e) => e.amountCents !== null)
        ? baseRentCents + sum(newEstimates.map((e) => e.amountCents ?? 0))
        : null,
      insuranceExpiresOn: nextLease.insuranceExpiresOn,
      insuranceRequest:
        nextLease.insuranceExpiresOn === null ||
        nextLease.insuranceExpiresOn < jan1,
    };
  }

  const businessName = input.tenant?.businessName ?? "";
  return {
    accountId: account.accountId,
    tenantId: account.tenantId,
    unitId: unit.id,
    businessName,
    unitLabel: unit.label,
    fileName: statementFileName(year, businessName, unit.label),
    countedMonths: months,
    rows,
    trueUpCents,
    priorBalanceCents,
    priorBalanceAsOf,
    balanceOnAccountCents:
      trueUpCents === null ? null : trueUpCents + priorBalanceCents,
    continuing,
    holdover: isHoldover(account, input.today),
  };
}

export function statementData(input: {
  statement: Omit<AccountStatement, "data">;
  year: number;
  letterDate: IsoDate;
  propertyName: string;
  letter: ReconciliationLetterDetails;
  tenant: ReconciliationTenant | null;
  unit: ReconciliationUnit;
  buildingSqft: number;
}): StatementData | null {
  const { statement } = input;
  if (
    statement.trueUpCents === null ||
    statement.balanceOnAccountCents === null
  ) {
    return null;
  }
  const rows = statement.rows.flatMap((row) =>
    row.partCents === null || row.balanceCents === null
      ? []
      : [
          {
            poolId: row.poolId,
            name: row.name,
            poolSqft: row.poolSqft,
            actualCents: row.actualCents,
            billOverride: row.billOverride,
            months: row.months,
            partCents: row.partCents,
            estimatesCents: row.estimatesCents,
            balanceCents: row.balanceCents,
          },
        ],
  );
  let continuing: StatementData["continuing"] = null;
  if (statement.continuing) {
    const newMonthlyRentCents = statement.continuing.newMonthlyRentCents;
    if (newMonthlyRentCents === null) return null;
    continuing = {
      effectiveDate: statement.continuing.effectiveDate,
      baseRentCents: statement.continuing.baseRentCents,
      newEstimates: statement.continuing.newEstimates.map((estimate) => ({
        poolId: estimate.poolId,
        name: estimate.name,
        letterName: estimate.letterName,
        amountCents: estimate.amountCents ?? 0,
      })),
      newMonthlyRentCents,
      insuranceRequest: statement.continuing.insuranceRequest,
    };
  }
  return {
    year: input.year,
    letterDate: input.letterDate,
    property: { name: input.propertyName },
    owner: {
      name: input.letter.ownerName ?? "",
      title: input.letter.ownerTitle ?? "",
      company: input.letter.companyName ?? "",
      phone: input.letter.ownerPhone ?? "",
      email: input.letter.ownerEmail ?? "",
    },
    tenant: {
      businessName: statement.businessName,
      mailingAddress: input.tenant?.mailingAddress ?? EMPTY_ADDRESS,
    },
    unit: {
      label: input.unit.label,
      address: input.unit.address,
      sqft: input.unit.sqft,
    },
    buildingSqft: input.buildingSqft,
    otherPoolAreas: rows
      .filter((row) => row.poolSqft !== input.buildingSqft)
      .map((row) => ({ name: row.name, sqft: row.poolSqft })),
    rows,
    trueUpCents: statement.trueUpCents,
    priorBalanceCents: statement.priorBalanceCents,
    priorBalanceAsOf: statement.priorBalanceAsOf,
    balanceOnAccountCents: statement.balanceOnAccountCents,
    continuing,
  };
}

export function newestBankDate(transactions: readonly Txn[]): IsoDate | null {
  let newest: IsoDate | null = null;
  for (const txn of transactions) {
    if (txn.source === "bank" && (newest === null || txn.postedOn > newest)) {
      newest = txn.postedOn;
    }
  }
  return newest;
}

const LETTER_FIELDS: [keyof ReconciliationLetterDetails, string][] = [
  ["ownerName", "owner name"],
  ["ownerTitle", "owner title"],
  ["companyName", "company"],
  ["ownerPhone", "phone"],
  ["ownerEmail", "email"],
];

export function reconciliationChecklist(input: {
  year: number;
  letter: ReconciliationLetterDetails;
  units: readonly ReconciliationUnit[];
  tenants: readonly ReconciliationTenant[];
  pools: readonly Pool[];
  actuals: readonly PoolActual[];
  statements: readonly Omit<AccountStatement, "data">[];
  transactions: readonly Txn[];
  overrides: readonly PoolBillOverride[];
}): ChecklistItem[] {
  const { year } = input;
  const items: ChecklistItem[] = [];
  const unitLabel = (unitId: string) =>
    input.units.find((u) => u.id === unitId)?.label ?? "";

  const unsorted = input.transactions.filter(
    (txn) => inYear(txn.postedOn, year) && txn.lines.length === 0,
  ).length;
  if (unsorted > 0) {
    items.push({
      severity: "blocker",
      code: "unsorted_transactions",
      count: unsorted,
      message: `${unsorted} ${unsorted === 1 ? "transaction" : "transactions"} dated in ${year} still ${unsorted === 1 ? "needs" : "need"} sorting.`,
    });
  }

  for (const pool of input.actuals) {
    const onStatements = input.statements.filter((s) =>
      s.rows.some((row) => row.poolId === pool.poolId),
    );
    if (onStatements.length === 0) continue;
    if (pool.poolSqft <= 0) {
      items.push({
        severity: "blocker",
        code: "pool_has_no_units",
        poolId: pool.poolId,
        message: `The ${pool.name} pool has no units, but ${onStatements.length === 1 ? "a lease pays" : "leases pay"} it. Add its units in Setup.`,
      });
    }
    for (const statement of onStatements) {
      if (!pool.unitIds.includes(statement.unitId)) {
        items.push({
          severity: "blocker",
          code: "unit_not_in_pool",
          poolId: pool.poolId,
          accountId: statement.accountId,
          unitId: statement.unitId,
          message: `Unit ${statement.unitLabel} pays the ${pool.name} pool but is not one of its units.`,
        });
      }
    }
    if (pool.actualCents < 0) {
      items.push({
        severity: "blocker",
        code: "negative_actual",
        poolId: pool.poolId,
        message: `The ${pool.name} cost for ${year} is ${formatCents(pool.actualCents)} because refunds are larger than costs. Enter the bill amount.`,
      });
    }
  }

  const missingFields = LETTER_FIELDS.filter(
    ([field]) => !input.letter[field]?.trim(),
  ).map(([, label]) => label);
  if (missingFields.length > 0) {
    items.push({
      severity: "blocker",
      code: "missing_letter_details",
      fields: missingFields,
      message: `Letter details are missing in Setup: ${missingFields.join(", ")}.`,
    });
  }

  const tenantIds = [...new Set(input.statements.map((s) => s.tenantId))];
  for (const tenantId of tenantIds) {
    const tenant = input.tenants.find((t) => t.id === tenantId);
    if (!tenant?.mailingAddress) {
      items.push({
        severity: "blocker",
        code: "missing_mailing_address",
        tenantId,
        message: `${tenant?.businessName ?? "A tenant"} has no mailing address.`,
      });
    }
  }

  for (const pool of input.actuals) {
    const hadLastYear = input.overrides.some(
      (o) => o.poolId === pool.poolId && o.year === year - 1,
    );
    if (hadLastYear && pool.billOverride === null) {
      items.push({
        severity: "warning",
        code: "bill_amount_missing",
        poolId: pool.poolId,
        message: `The ${pool.name} pool used a bill amount in ${year - 1} but has none for ${year}.`,
      });
    }
  }

  for (const statement of input.statements) {
    if (statement.holdover) {
      items.push({
        severity: "warning",
        code: "holdover",
        accountId: statement.accountId,
        message: `${statement.businessName} (unit ${statement.unitLabel}) is past its lease end date. Finalize would give it new estimates.`,
      });
    }
  }

  const newest = newestBankDate(input.transactions);
  if (newest === null || newest < yearEnd(year)) {
    items.push({
      severity: "warning",
      code: "bank_data_through",
      date: newest,
      message:
        newest === null
          ? "No bank data has been imported."
          : `Bank data only through ${longDate(newest)}.`,
    });
  }

  for (const pool of sortedPools(input.pools)) {
    if (
      pool.membersChangedOn !== null &&
      pool.membersChangedOn >= `${year}-01-01`
    ) {
      items.push({
        severity: "warning",
        code: "pool_members_changed",
        poolId: pool.id,
        date: pool.membersChangedOn,
        message: `The ${pool.name} pool's units changed on ${longDate(pool.membersChangedOn)}. The current units apply to all of ${year}.`,
      });
    }
  }
  for (const unit of input.units) {
    if (unit.sqftChangedOn !== null && unit.sqftChangedOn >= `${year}-01-01`) {
      items.push({
        severity: "warning",
        code: "unit_sqft_changed",
        unitId: unit.id,
        date: unit.sqftChangedOn,
        message: `Unit ${unitLabel(unit.id)}'s sqft changed on ${longDate(unit.sqftChangedOn)}. The current sqft applies to all of ${year}.`,
      });
    }
  }

  return items;
}

export function reconciliationWorkspace(
  input: ReconciliationInput,
): ReconciliationWorkspace {
  const { year, today } = input;
  const actuals = poolActuals({
    year,
    pools: input.pools,
    categories: input.categories,
    transactions: input.transactions,
    units: input.units,
    overrides: input.overrides,
  });
  const buildingSqft = sum(input.units.map((unit) => unit.sqft));
  const previewLetterDate = input.record?.letterDate ?? today;

  const statements: AccountStatement[] = input.accounts
    .flatMap((account) => {
      const unit = input.units.find((u) => u.id === account.unitId);
      if (!unit) {
        throw new Error(`Unit ${account.unitId} not found`);
      }
      const tenant =
        input.tenants.find((t) => t.id === account.tenantId) ?? null;
      const statement = accountStatement({
        year,
        today,
        trackingStart: input.trackingStart,
        account,
        unit,
        tenant,
        pools: actuals,
        ledger: {
          account,
          trackingStart: input.trackingStart,
          payments: accountPayments(input.transactions, account.accountId),
          entries: accountEntries(input.entries, account.accountId),
        },
      });
      if (!statement) return [];
      return [
        {
          ...statement,
          data: statementData({
            statement,
            year,
            letterDate: previewLetterDate,
            propertyName: input.propertyName,
            letter: input.letter,
            tenant,
            unit,
            buildingSqft,
          }),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true }) ||
        a.businessName.localeCompare(b.businessName),
    );

  const checklist = reconciliationChecklist({
    year,
    letter: input.letter,
    units: input.units,
    tenants: input.tenants,
    pools: input.pools,
    actuals,
    statements,
    transactions: input.transactions,
    overrides: input.overrides,
  });

  const status = input.record?.status ?? "draft";
  const letterDate = input.record?.letterDate ?? null;
  const gates: FinalizeGates = {
    draft: status === "draft",
    letterDateAfterYearEnd: letterDate !== null && letterDate > yearEnd(year),
    todayAfterYearEnd: today > yearEnd(year),
  };

  return {
    year,
    status,
    letterDate,
    previewLetterDate,
    finalizedAt: input.record?.finalizedAt ?? null,
    today,
    priorBalanceAsOf: today < yearEnd(year) ? today : yearEnd(year),
    newestBankDate: newestBankDate(input.transactions),
    pools: actuals,
    statements,
    checklist,
    gates,
    canFinalize:
      checklist.every((item) => item.severity !== "blocker") &&
      gates.draft &&
      gates.letterDateAfterYearEnd &&
      gates.todayAfterYearEnd,
  };
}
