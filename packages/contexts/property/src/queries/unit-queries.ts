import type {
  UnitStatus,
  UtilityAssignment,
} from "../aggregates/unit";
import type { Address } from "../value-objects/address";

export interface UnitView {
  id: string;
  propertyId: string;
  label: string;
  sqft: number;
  bedrooms?: number;
  bathrooms?: number;
  addressOverride: Address | null;
  utilities: UtilityAssignment[];
  status: UnitStatus;
}

export interface UnitQueries {
  list(): Promise<UnitView[]>;
  getById(id: string): Promise<UnitView | null>;
}
