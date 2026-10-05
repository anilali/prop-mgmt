import type { Account } from "../aggregates/account";

export interface AccountRepository {
  findById(propertyId: string, id: string): Promise<Account | null>;
  save(account: Account): Promise<void>;
  delete(propertyId: string, id: string): Promise<void>;
}
