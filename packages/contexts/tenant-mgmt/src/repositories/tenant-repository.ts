import type { Tenant } from "../aggregates/tenant";

export interface TenantRepository {
  findById(propertyId: string, id: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<void>;
}
