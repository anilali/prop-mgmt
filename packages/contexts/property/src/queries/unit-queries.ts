import type { IsoDate } from "@moonship/shared";

import type { Address } from "../value-objects/address";

export interface UnitView {
  id: string;
  propertyId: string;
  label: string;
  sqft: number;
  sqftChangedOn: IsoDate | null;
  address: Address;
}

export interface UnitQueries {
  list(propertyId: string): Promise<UnitView[]>;
  getById(propertyId: string, id: string): Promise<UnitView | null>;
}
