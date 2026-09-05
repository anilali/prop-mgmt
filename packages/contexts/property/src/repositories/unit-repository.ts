import type { Unit } from "../aggregates/unit";

export interface UnitRepository {
  findById(id: string): Promise<Unit | null>;
  save(unit: Unit): Promise<void>;
  delete(id: string): Promise<void>;
}
