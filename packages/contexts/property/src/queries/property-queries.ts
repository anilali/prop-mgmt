import type { Address } from "../value-objects/address";

export interface PropertyView {
  id: string;
  name: string;
  address: Address;
}

export interface PropertyQueries {
  getById(id: string): Promise<PropertyView | null>;
  listByIds(ids: string[]): Promise<PropertyView[]>;
  list(): Promise<PropertyView[]>;
}
