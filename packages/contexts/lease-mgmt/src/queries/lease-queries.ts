import type { LeaseDocument, LeaseStatus } from "../aggregates/lease";

export interface LeaseView {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
  rentCents: number;
  depositCents?: number;
  status: LeaseStatus;
  document: LeaseDocument | null;
}

export interface LeaseListFilters {
  unitId?: string;
  status?: LeaseStatus;
}

export interface LeaseQueries {
  list(filters?: LeaseListFilters): Promise<LeaseView[]>;
  getById(id: string): Promise<LeaseView | null>;
  listActiveByUnitId(unitId: string): Promise<LeaseView[]>;
}
