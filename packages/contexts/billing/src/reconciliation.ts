import type { Address, IsoDate, YearMonth } from "@moonship/shared";
import { formatCents, monthOf, prorate } from "@moonship/shared";

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
  StatementSnapshot,
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

export interface FinalizeEstimateStep {
  leaseId: string;
  poolId: string;
  startsOn: IsoDate;
  amountCents: number;
}

export interface FinalizeStatement {
  accountId: string;
  businessName: string;
  unitLabel: string;
  fileName: string;
  data: StatementData;
  snapshot: StatementSnapshot;
  trueUp: LedgerEntry | null;
  estimateSteps: FinalizeEstimateStep[];
}

export interface FinalizePlan {
  year: number;
  letterDate: IsoDate;
  statements: FinalizeStatement[];
}

export function statementStorageKey(
  propertyId: string,
  year: number,
  accountId: string,
): string {
  return `reconciliations/${propertyId}/${year}/${accountId}.pdf`;
}

export function finalizeBlockers(workspace: ReconciliationWorkspace): string[] {
  const { year } = workspace;
  const reasons: string[] = [];
  if (!workspace.gates.draft) {
    reasons.push(`${year} is already finalized.`);
  }
  if (workspace.letterDate === null) {
    reasons.push("Set the letter date.");
  } else if (!workspace.gates.letterDateAfterYearEnd) {
    reasons.push(`The letter date must be after ${longDate(yearEnd(year))}.`);
  }
  if (!workspace.gates.todayAfterYearEnd) {
    reasons.push(
      `${year} can be finalized from ${longDate(nextJanuary1(year))}.`,
    );
  }
  for (const item of workspace.checklist) {
    if (item.severity === "blocker") reasons.push(item.message);
  }
  return reasons;
}

function newEstimateSteps(
  statement: AccountStatement,
  year: number,
): FinalizeEstimateStep[] {
  const continuing = statement.continuing;
  if (!continuing) return [];
  return continuing.newEstimates.map((estimate) => {
    if (estimate.amountCents === null) {
      throw new Error(
        `The new ${estimate.name} estimate for ${statement.businessName} is missing`,
      );
    }
    return {
      leaseId: continuing.leaseId,
      poolId: estimate.poolId,
      startsOn: nextJanuary1(year),
      amountCents: estimate.amountCents,
    };
  });
}

export function finalizePlan(input: {
  propertyId: string;
  record: ReconciliationYear;
  workspace: ReconciliationWorkspace;
  createdAt: Date;
  newId: () => string;
}): FinalizePlan {
  const { workspace, record, propertyId } = input;
  if (record.year !== workspace.year || record.propertyId !== propertyId) {
    throw new Error("The reconciliation year does not match the workspace");
  }
  const blockers = finalizeBlockers(workspace);
  if (blockers.length > 0) throw new Error(blockers.join(" "));
  const letterDate = workspace.letterDate;
  if (letterDate === null) throw new Error("Set the letter date.");

  const statements = workspace.statements.map((statement) => {
    const { data, trueUpCents, balanceOnAccountCents } = statement;
    if (
      data === null ||
      trueUpCents === null ||
      balanceOnAccountCents === null
    ) {
      throw new Error(
        `The statement for ${statement.businessName} (unit ${statement.unitLabel}) is incomplete`,
      );
    }
    const trueUp: LedgerEntry | null =
      trueUpCents === 0
        ? null
        : {
            id: input.newId(),
            propertyId,
            accountId: statement.accountId,
            kind: "true_up",
            entryDate: letterDate,
            amountCents: trueUpCents,
            note: null,
            feeMonth: null,
            reconciliationYearId: record.id,
          };
    return {
      accountId: statement.accountId,
      businessName: statement.businessName,
      unitLabel: statement.unitLabel,
      fileName: statement.fileName,
      data,
      snapshot: {
        id: input.newId(),
        propertyId,
        reconciliationYearId: record.id,
        year: workspace.year,
        accountId: statement.accountId,
        tenantId: statement.tenantId,
        data,
        trueUpCents,
        balanceOnAccountCents,
        pdfStorageKey: statementStorageKey(
          propertyId,
          workspace.year,
          statement.accountId,
        ),
        createdAt: input.createdAt,
      },
      trueUp,
      estimateSteps: newEstimateSteps(statement, workspace.year),
    };
  });

  return { year: workspace.year, letterDate, statements };
}

export type DifferenceUnit = "cents" | "months";

export interface SnapshotDifference {
  label: string;
  unit: DifferenceUnit;
  snapshot: number | null;
  now: number | null;
  difference: number | null;
  message: string;
}

export interface SnapshotComparison {
  accountId: string;
  businessName: string;
  unitLabel: string;
  hasSnapshot: boolean;
  hasStatementNow: boolean;
  matches: boolean;
  differences: SnapshotDifference[];
}

interface ComparableRow {
  poolId: string;
  name: string;
  actualCents: number;
  months: number;
  partCents: number | null;
  estimatesCents: number;
  balanceCents: number | null;
}

interface ComparableEstimate {
  poolId: string;
  name: string;
  amountCents: number | null;
}

interface ComparableStatement {
  rows: readonly ComparableRow[];
  trueUpCents: number | null;
  priorBalanceCents: number;
  balanceOnAccountCents: number | null;
  newEstimates: readonly ComparableEstimate[];
  newMonthlyRentCents: number | null;
}

function comparableSnapshot(data: StatementData): ComparableStatement {
  return {
    rows: data.rows,
    trueUpCents: data.trueUpCents,
    priorBalanceCents: data.priorBalanceCents,
    balanceOnAccountCents: data.balanceOnAccountCents,
    newEstimates: data.continuing?.newEstimates ?? [],
    newMonthlyRentCents: data.continuing?.newMonthlyRentCents ?? null,
  };
}

function comparableStatement(statement: AccountStatement): ComparableStatement {
  return {
    rows: statement.rows,
    trueUpCents: statement.trueUpCents,
    priorBalanceCents: statement.priorBalanceCents,
    balanceOnAccountCents: statement.balanceOnAccountCents,
    newEstimates: statement.continuing?.newEstimates ?? [],
    newMonthlyRentCents: statement.continuing?.newMonthlyRentCents ?? null,
  };
}

function formatValue(value: number | null, unit: DifferenceUnit): string {
  if (value === null) return "none";
  return unit === "cents" ? formatCents(value) : String(value);
}

function formatChange(change: number, unit: DifferenceUnit): string {
  const text = formatValue(change, unit);
  return change > 0 ? `+${text}` : text;
}

function difference(
  label: string,
  unit: DifferenceUnit,
  snapshot: number | null,
  now: number | null,
): SnapshotDifference | null {
  if (snapshot === now) return null;
  const change = snapshot !== null && now !== null ? now - snapshot : null;
  const changeText = change === null ? "" : ` (${formatChange(change, unit)})`;
  return {
    label,
    unit,
    snapshot,
    now,
    difference: change,
    message: `${label}: ${formatValue(snapshot, unit)}, now ${formatValue(now, unit)}${changeText}`,
  };
}

function poolIdsOf(
  first: readonly { poolId: string }[],
  second: readonly { poolId: string }[],
): string[] {
  const ids = first.map((item) => item.poolId);
  for (const item of second) {
    if (!ids.includes(item.poolId)) ids.push(item.poolId);
  }
  return ids;
}

function rowDifferences(
  before: readonly ComparableRow[],
  after: readonly ComparableRow[],
): (SnapshotDifference | null)[] {
  return poolIdsOf(before, after).flatMap((poolId) => {
    const old = before.find((row) => row.poolId === poolId);
    const now = after.find((row) => row.poolId === poolId);
    const name = old?.name ?? now?.name ?? "";
    return [
      difference(
        `${name} cost`,
        "cents",
        old?.actualCents ?? null,
        now?.actualCents ?? null,
      ),
      difference(
        `${name} months`,
        "months",
        old?.months ?? null,
        now?.months ?? null,
      ),
      difference(
        `${name} annual share`,
        "cents",
        old?.partCents ?? null,
        now?.partCents ?? null,
      ),
      difference(
        `${name} estimates billed`,
        "cents",
        old?.estimatesCents ?? null,
        now?.estimatesCents ?? null,
      ),
      difference(
        `${name} balance due`,
        "cents",
        old?.balanceCents ?? null,
        now?.balanceCents ?? null,
      ),
    ];
  });
}

function estimateDifferences(
  before: readonly ComparableEstimate[],
  after: readonly ComparableEstimate[],
): (SnapshotDifference | null)[] {
  return poolIdsOf(before, after).map((poolId) => {
    const old = before.find((estimate) => estimate.poolId === poolId);
    const now = after.find((estimate) => estimate.poolId === poolId);
    return difference(
      `New ${old?.name ?? now?.name ?? ""} estimate`,
      "cents",
      old?.amountCents ?? null,
      now?.amountCents ?? null,
    );
  });
}

function statementDifferences(
  before: ComparableStatement | null,
  after: ComparableStatement | null,
): SnapshotDifference[] {
  return [
    ...rowDifferences(before?.rows ?? [], after?.rows ?? []),
    difference(
      "True-up",
      "cents",
      before?.trueUpCents ?? null,
      after?.trueUpCents ?? null,
    ),
    difference(
      "Rent balance",
      "cents",
      before?.priorBalanceCents ?? null,
      after?.priorBalanceCents ?? null,
    ),
    difference(
      "Balance on account",
      "cents",
      before?.balanceOnAccountCents ?? null,
      after?.balanceOnAccountCents ?? null,
    ),
    ...estimateDifferences(
      before?.newEstimates ?? [],
      after?.newEstimates ?? [],
    ),
    difference(
      "New monthly rent",
      "cents",
      before?.newMonthlyRentCents ?? null,
      after?.newMonthlyRentCents ?? null,
    ),
  ].filter((item): item is SnapshotDifference => item !== null);
}

export function compareSnapshots(
  snapshots: readonly StatementSnapshot[],
  statements: readonly AccountStatement[],
): SnapshotComparison[] {
  const fromSnapshots = snapshots.map((snapshot) => {
    const statement =
      statements.find((s) => s.accountId === snapshot.accountId) ?? null;
    const differences = statementDifferences(
      comparableSnapshot(snapshot.data),
      statement ? comparableStatement(statement) : null,
    );
    return {
      accountId: snapshot.accountId,
      businessName: snapshot.data.tenant.businessName,
      unitLabel: snapshot.data.unit.label,
      hasSnapshot: true,
      hasStatementNow: statement !== null,
      matches: statement !== null && differences.length === 0,
      differences,
    };
  });
  const newStatements = statements
    .filter((s) => !snapshots.some((snap) => snap.accountId === s.accountId))
    .map((statement) => ({
      accountId: statement.accountId,
      businessName: statement.businessName,
      unitLabel: statement.unitLabel,
      hasSnapshot: false,
      hasStatementNow: true,
      matches: false,
      differences: statementDifferences(null, comparableStatement(statement)),
    }));
  return [...fromSnapshots, ...newStatements];
}

export interface JanuaryRow {
  accountId: string;
  businessName: string;
  unitLabel: string;
  newMonthlyRentCents: number;
  paidCents: number;
  shortCents: number;
}

export interface JanuaryTable {
  month: YearMonth;
  from: IsoDate;
  through: IsoDate;
  rows: JanuaryRow[];
}

export function januaryTable(input: {
  year: number;
  today: IsoDate;
  snapshots: readonly StatementSnapshot[];
  transactions: readonly Txn[];
}): JanuaryTable {
  const from = nextJanuary1(input.year);
  const monthEnd = `${input.year + 1}-01-31`;
  const through = input.today < monthEnd ? input.today : monthEnd;
  const rows = input.snapshots.flatMap((snapshot) => {
    const continuing = snapshot.data.continuing;
    if (!continuing) return [];
    const paidCents = sum(
      accountPayments(input.transactions, snapshot.accountId)
        .filter((p) => p.postedOn >= from && p.postedOn <= through)
        .map((p) => p.amountCents),
    );
    return [
      {
        accountId: snapshot.accountId,
        businessName: snapshot.data.tenant.businessName,
        unitLabel: snapshot.data.unit.label,
        newMonthlyRentCents: continuing.newMonthlyRentCents,
        paidCents,
        shortCents: continuing.newMonthlyRentCents - paidCents,
      },
    ];
  });
  return { month: monthOf(from), from, through, rows };
}

export function snapshotFileName(snapshot: StatementSnapshot): string {
  return statementFileName(
    snapshot.data.year,
    snapshot.data.tenant.businessName,
    snapshot.data.unit.label,
  );
}

export interface FinalizedSnapshot {
  accountId: string;
  tenantId: string;
  fileName: string;
  createdAt: Date;
  trueUpCents: number;
  balanceOnAccountCents: number;
  data: StatementData;
}

export interface FinalizedYearView {
  snapshots: FinalizedSnapshot[];
  comparisons: SnapshotComparison[];
  mismatchCount: number;
  january: JanuaryTable;
}

export function finalizedYearView(input: {
  workspace: ReconciliationWorkspace;
  snapshots: readonly StatementSnapshot[];
  transactions: readonly Txn[];
}): FinalizedYearView {
  const { workspace } = input;
  const snapshots = input.snapshots
    .filter((snapshot) => snapshot.year === workspace.year)
    .sort(
      (a, b) =>
        a.data.unit.label.localeCompare(b.data.unit.label, undefined, {
          numeric: true,
        }) ||
        a.data.tenant.businessName.localeCompare(b.data.tenant.businessName),
    );
  const comparisons = compareSnapshots(snapshots, workspace.statements);
  return {
    snapshots: snapshots.map((snapshot) => ({
      accountId: snapshot.accountId,
      tenantId: snapshot.tenantId,
      fileName: snapshotFileName(snapshot),
      createdAt: snapshot.createdAt,
      trueUpCents: snapshot.trueUpCents,
      balanceOnAccountCents: snapshot.balanceOnAccountCents,
      data: snapshot.data,
    })),
    comparisons,
    mismatchCount: comparisons.filter((c) => !c.matches).length,
    january: januaryTable({
      year: workspace.year,
      today: workspace.today,
      snapshots,
      transactions: input.transactions,
    }),
  };
}
