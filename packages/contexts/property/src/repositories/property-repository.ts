import type { Property } from "../aggregates/property";

export interface PropertyRepository {
  findById(id: string): Promise<Property | null>;
  findSingleton(): Promise<Property | null>;
  save(property: Property): Promise<void>;
}
