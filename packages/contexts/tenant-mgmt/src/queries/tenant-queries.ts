import type { TenantStatus } from "../aggregates/tenant";

export interface TenantView {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  notes?: string;
  status: TenantStatus;
}

export interface TenantQueries {
  list(): Promise<TenantView[]>;
  getById(id: string): Promise<TenantView | null>;
}
