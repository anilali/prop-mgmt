import type { LeaseDocument, LeaseStatus } from "../aggregates/lease";

export interface LeaseView {
  id: string;
  propertyId: string;
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
  list(propertyId: string, filters?: LeaseListFilters): Promise<LeaseView[]>;
  getById(propertyId: string, id: string): Promise<LeaseView | null>;
  listActiveByUnitId(propertyId: string, unitId: string): Promise<LeaseView[]>;
}
