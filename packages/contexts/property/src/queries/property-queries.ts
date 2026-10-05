import type { IsoDate } from "@moonship/shared";

import type { LetterDetails } from "../aggregates/property";
import type { Address } from "../value-objects/address";

export interface PropertyView {
  id: string;
  name: string;
  address: Address;
  trackingStartDate: IsoDate | null;
  timeZone: string;
  letter: LetterDetails;
}

export interface PropertyQueries {
  getById(id: string): Promise<PropertyView | null>;
  listByIds(ids: string[]): Promise<PropertyView[]>;
  list(): Promise<PropertyView[]>;
}
