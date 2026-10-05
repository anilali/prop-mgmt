import type { IsoDate } from "@moonship/shared";

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
