import type { TenantStatus } from "../aggregates/tenant";

export interface TenantView {
  id: string;
  propertyId: string;
  fullName: string;
  email?: string;
  phone?: string;
  notes?: string;
  status: TenantStatus;
}

export interface TenantQueries {
  list(propertyId: string): Promise<TenantView[]>;
  getById(propertyId: string, id: string): Promise<TenantView | null>;
}
