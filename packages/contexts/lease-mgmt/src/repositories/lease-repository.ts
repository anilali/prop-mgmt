import type { Lease } from "../aggregates/lease";

export interface LeaseRepository {
  findById(id: string): Promise<Lease | null>;
  save(lease: Lease): Promise<void>;
}
