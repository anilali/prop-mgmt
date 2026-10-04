import type { PropertyAccess } from "../aggregates/property-access";
import type { PlatformAdmin } from "../entities/platform-admin";

export class OptimisticConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimisticConcurrencyError";
  }
}

export interface PropertyAccessRepository {
  findByPropertyId(propertyId: string): Promise<PropertyAccess | null>;
  save(access: PropertyAccess, expectedVersion: number): Promise<void>;
}

export interface PlatformAdminRepository {
  findByAuthUserId(authUserId: string): Promise<PlatformAdmin | null>;
  claimByEmail(email: string, authUserId: string): Promise<boolean>;
}
