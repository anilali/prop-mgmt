import type { Unit } from "../aggregates/unit";

export interface UnitRepository {
  findById(propertyId: string, id: string): Promise<Unit | null>;
  save(unit: Unit): Promise<void>;
  delete(propertyId: string, id: string): Promise<void>;
}
