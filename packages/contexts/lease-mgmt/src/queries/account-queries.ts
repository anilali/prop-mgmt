import type { Lease } from "../aggregates/account";

export interface AccountView {
  id: string;
  propertyId: string;
  tenantId: string;
  unitId: string;
  openingBalanceCents: number;
  leases: Lease[];
}

export interface AccountQueries {
  list(propertyId: string): Promise<AccountView[]>;
  getById(propertyId: string, id: string): Promise<AccountView | null>;
}
