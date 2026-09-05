import type { Address } from "../value-objects/address";

export interface PropertyView {
  id: string;
  name: string;
  address: Address;
}

export interface PropertyQueries {
  get(): Promise<PropertyView | null>;
}
