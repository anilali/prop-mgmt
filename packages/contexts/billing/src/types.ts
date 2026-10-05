import type { IsoDate, YearMonth } from "@moonship/shared";

export interface LeaseTerms {
  leaseId: string;
  startDate: IsoDate;
  endDate: IsoDate;
  moveOutDate: IsoDate | null;
  lateFee: { amountCents: number; day: number } | null;
  insuranceExpiresOn: IsoDate | null;
  rentSteps: {
    id: string;
    startsOn: IsoDate;
    amountCents: number;
    tenantNotifiedAt: Date | null;
  }[];
  estimateSteps: {
    id: string;
    poolId: string;
    startsOn: IsoDate;
    amountCents: number;
  }[];
}

export interface AccountTerms {
  accountId: string;
  tenantId: string;
  unitId: string;
  openingBalanceCents: number;
  leases: LeaseTerms[];
}

export interface Pool {
  id: string;
  propertyId: string;
  name: string;
  letterName: string;
  addsNewUnits: boolean;
  sortOrder: number;
  membersChangedOn: IsoDate | null;
  unitIds: string[];
}

export const CATEGORY_KINDS = [
  "shared_cost",
  "owner_expense",
  "income",
  "not_counted",
] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface Category {
  id: string;
  propertyId: string;
  name: string;
  kind: CategoryKind;
  poolId: string | null;
  archivedAt: Date | null;
}

export const CSV_DATE_FORMATS = [
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "DD/MM/YYYY",
] as const;

export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];

export interface CsvMapping {
  dateColumn: string;
  dateFormat: CsvDateFormat;
  descriptionColumn: string;
  amount:
    | { mode: "signed"; column: string; flipSign: boolean }
    | { mode: "debitCredit"; debitColumn: string; creditColumn: string };
  idColumn: string | null;
}

export type TransactionSource = "bank" | "cash";

export interface AllocationLine {
  accountId: string | null;
  categoryId: string | null;
  amountCents: number;
}

export interface Txn {
  id: string;
  propertyId: string;
  source: TransactionSource;
  importBatchId: string | null;
  postedOn: IsoDate;
  description: string;
  descriptionKey: string;
  amountCents: number;
  externalId: string | null;
  lines: AllocationLine[];
}

export interface BankAccount {
  id: string;
  propertyId: string;
  name: string;
  csvMapping: CsvMapping | null;
}

export interface ImportBatch {
  id: string;
  propertyId: string;
  bankAccountId: string;
  fileName: string;
  importedAt: Date;
  rowCount: number;
  insertedCount: number;
  duplicateCount: number;
  beforeTrackingStartCount: number;
  notTransactionCount: number;
  firstPostedOn: IsoDate | null;
  lastPostedOn: IsoDate | null;
}

export interface NewBankTransaction {
  id: string;
  postedOn: IsoDate;
  description: string;
  descriptionKey: string;
  amountCents: number;
  externalId: string | null;
  rawRowHash: string;
}

export interface CashExpense {
  id: string;
  propertyId: string;
  postedOn: IsoDate;
  description: string;
  amountCents: number;
  categoryId: string;
}

export const LEDGER_ENTRY_KINDS = [
  "late_fee",
  "late_fee_dismissed",
  "adjustment",
  "true_up",
] as const;

export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[number];

export interface LedgerEntry {
  id: string;
  propertyId: string;
  accountId: string;
  kind: LedgerEntryKind;
  entryDate: IsoDate;
  amountCents: number;
  note: string | null;
  feeMonth: YearMonth | null;
  reconciliationYearId: string | null;
}

export const RECONCILIATION_STATUSES = ["draft", "finalized"] as const;

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface ReconciliationYear {
  id: string;
  propertyId: string;
  year: number;
  status: ReconciliationStatus;
  letterDate: IsoDate | null;
  finalizedAt: Date | null;
}

export interface PoolBillOverride {
  id: string;
  propertyId: string;
  reconciliationYearId: string;
  year: number;
  poolId: string;
  amountCents: number;
  note: string;
}
