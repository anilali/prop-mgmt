import type { IsoDate } from "@moonship/shared";

import type {
  FinalizedYearView,
  PoolActual,
  ReconciliationWorkspace,
} from "./reconciliation";
import type { StatementData } from "./statement-document";
import type {
  Pool,
  ReconciliationYear,
  RecordedPoolLine,
  StatementSnapshot,
  TransactionSource,
} from "./types";
import {
  finalizedSnapshot,
  firstReconciliationYear,
  sortedPools,
  statementStorageKey,
  yearEnd,
  yearSnapshots,
} from "./reconciliation";
import {
  costPerSqftMonthHundredths,
  costPerSqftYearCents,
} from "./statement-document";

export interface RecordedStatementInput {
  accountId: string;
  tenantId: string;
  data: StatementData;
}

export interface RecordedLineInput {
  poolId: string;
  postedOn: IsoDate;
  description: string;
  source: TransactionSource;
  costCents: number;
}

export interface RecordedYearPlan {
  record: ReconciliationYear;
  snapshots: StatementSnapshot[];
  lines: RecordedPoolLine[];
}

interface SnapshotPool {
  poolId: string;
  name: string;
  poolSqft: number;
  actualCents: number;
}

function sum(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

function snapshotPools(snapshots: readonly { data: StatementData }[]) {
  const pools = new Map<string, SnapshotPool>();
  for (const { data } of snapshots) {
    for (const row of data.rows) {
      const seen = pools.get(row.poolId);
      if (!seen) {
        pools.set(row.poolId, {
          poolId: row.poolId,
          name: row.name,
          poolSqft: row.poolSqft,
          actualCents: row.actualCents,
        });
      } else if (seen.actualCents !== row.actualCents) {
        throw new Error(
          `The statements disagree on the ${row.name} actual cost`,
        );
      }
    }
  }
  return [...pools.values()];
}

export function recordedYearPlan(input: {
  propertyId: string;
  year: number;
  trackingStart: IsoDate;
  letterDate: IsoDate;
  statements: readonly RecordedStatementInput[];
  lines: readonly RecordedLineInput[];
  createdAt: Date;
  newId: () => string;
}): RecordedYearPlan {
  const { propertyId, year, letterDate } = input;
  const firstYear = firstReconciliationYear(input.trackingStart);
  if (year >= firstYear) {
    throw new Error(
      `${year} is tracked in the app. Only a year before ${firstYear} can be recorded.`,
    );
  }
  if (letterDate <= yearEnd(year)) {
    throw new Error(`The letter date must be after ${yearEnd(year)}`);
  }
  if (input.statements.length === 0) {
    throw new Error("A recorded year needs at least one statement");
  }
  const accountIds = new Set(input.statements.map((s) => s.accountId));
  if (accountIds.size !== input.statements.length) {
    throw new Error("Each account can have only one statement");
  }
  for (const { data } of input.statements) {
    if (data.year !== year || data.letterDate !== letterDate) {
      throw new Error(
        `The statement for ${data.tenant.businessName} (unit ${data.unit.label}) is not for ${year} with letter date ${letterDate}`,
      );
    }
  }
  const pools = snapshotPools(input.statements);
  for (const line of input.lines) {
    if (!pools.some((pool) => pool.poolId === line.poolId)) {
      throw new Error(
        `The line "${line.description}" is for a pool no statement has`,
      );
    }
    if (!Number.isSafeInteger(line.costCents) || line.costCents === 0) {
      throw new Error(`The line "${line.description}" needs a cost in cents`);
    }
    if (line.description.trim() === "") {
      throw new Error("Each line needs a description");
    }
  }
  for (const pool of pools) {
    const total = sum(
      input.lines
        .filter((line) => line.poolId === pool.poolId)
        .map((line) => line.costCents),
    );
    if (total !== pool.actualCents) {
      throw new Error(
        `The ${pool.name} lines add up to ${total} cents, but the statements use ${pool.actualCents}`,
      );
    }
  }

  const record: ReconciliationYear = {
    id: input.newId(),
    propertyId,
    year,
    status: "finalized",
    source: "recorded",
    letterDate,
    finalizedAt: input.createdAt,
  };
  return {
    record,
    snapshots: input.statements.map((statement) => ({
      id: input.newId(),
      propertyId,
      reconciliationYearId: record.id,
      year,
      accountId: statement.accountId,
      tenantId: statement.tenantId,
      data: statement.data,
      trueUpCents: statement.data.trueUpCents,
      balanceOnAccountCents: statement.data.balanceOnAccountCents,
      pdfStorageKey: statementStorageKey(propertyId, year, statement.accountId),
      createdAt: input.createdAt,
    })),
    lines: input.lines.map((line) => ({
      id: input.newId(),
      propertyId,
      reconciliationYearId: record.id,
      year,
      poolId: line.poolId,
      postedOn: line.postedOn,
      description: line.description.trim(),
      source: line.source,
      costCents: line.costCents,
    })),
  };
}

export function recordedPoolActuals(input: {
  snapshots: readonly StatementSnapshot[];
  lines: readonly RecordedPoolLine[];
  pools: readonly Pool[];
}): PoolActual[] {
  const order = sortedPools(input.pools).map((pool) => pool.id);
  const rank = (poolId: string) => {
    const index = order.indexOf(poolId);
    return index === -1 ? order.length : index;
  };
  return snapshotPools(input.snapshots)
    .sort((a, b) => rank(a.poolId) - rank(b.poolId))
    .map((pool) => {
      const current = input.pools.find((p) => p.id === pool.poolId);
      const lines = input.lines
        .filter((line) => line.poolId === pool.poolId)
        .sort((a, b) =>
          a.postedOn < b.postedOn ? -1 : a.postedOn > b.postedOn ? 1 : 0,
        )
        .map((line) => ({
          transactionId: line.id,
          postedOn: line.postedOn,
          description: line.description,
          source: line.source,
          amountCents: -line.costCents,
        }));
      const actualCents = sum(lines.map((line) => -line.amountCents));
      return {
        poolId: pool.poolId,
        name: pool.name,
        letterName: current?.letterName ?? pool.name,
        categoryId: null,
        unitIds: [],
        poolSqft: pool.poolSqft,
        lines,
        categoryTotalCents: actualCents,
        billOverride: null,
        actualCents,
        costPerSqftYearCents:
          pool.poolSqft > 0
            ? costPerSqftYearCents(actualCents, pool.poolSqft)
            : null,
        costPerSqftMonthHundredths:
          pool.poolSqft > 0
            ? costPerSqftMonthHundredths(actualCents, pool.poolSqft)
            : null,
      };
    });
}

export function recordedYearWorkspace(input: {
  record: ReconciliationYear;
  today: IsoDate;
  newestBankDate: IsoDate | null;
  snapshots: readonly StatementSnapshot[];
  lines: readonly RecordedPoolLine[];
  pools: readonly Pool[];
}): { workspace: ReconciliationWorkspace; finalized: FinalizedYearView } {
  const { record, today } = input;
  if (record.source !== "recorded" || record.status !== "finalized") {
    throw new Error(`${record.year} is not a recorded year`);
  }
  const snapshots = yearSnapshots(input.snapshots, record.year);
  const workspace: ReconciliationWorkspace = {
    year: record.year,
    status: record.status,
    source: record.source,
    letterDate: record.letterDate,
    previewLetterDate: record.letterDate ?? today,
    finalizedAt: record.finalizedAt,
    today,
    priorBalanceAsOf: yearEnd(record.year),
    newestBankDate: input.newestBankDate,
    pools: recordedPoolActuals({
      snapshots,
      lines: input.lines.filter((line) => line.year === record.year),
      pools: input.pools,
    }),
    statements: [],
    checklist: [],
    gates: {
      draft: false,
      previousYearFinalized: true,
      letterDateAfterYearEnd: true,
      todayAfterYearEnd: today > yearEnd(record.year),
    },
    canFinalize: false,
  };
  return {
    workspace,
    finalized: {
      snapshots: snapshots.map(finalizedSnapshot),
      comparisons: [],
      mismatchCount: 0,
      january: null,
    },
  };
}
