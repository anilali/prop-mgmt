import type { Address } from "@moonship/shared";

import type { TenantStatus } from "../aggregates/tenant";

export interface TenantView {
  id: string;
  propertyId: string;
  businessName: string;
  contactName?: string;
  mailingAddress?: Address;
  email?: string;
  phone?: string;
  notes?: string;
  status: TenantStatus;
}

export interface TenantQueries {
  list(propertyId: string): Promise<TenantView[]>;
  getById(propertyId: string, id: string): Promise<TenantView | null>;
}
