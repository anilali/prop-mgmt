import { and, asc, eq } from "drizzle-orm";

import type { AccountQueries, AccountView } from "@moonship/lease-mgmt";

import type { DbExecutor } from "../../client";
import {
  loadLeases,
  toAccountView,
} from "../../repositories/lease-mgmt/account-rows";
import { accounts } from "../../schemas/lease-mgmt/schema";

export class PGAccountQueries implements AccountQueries {
  constructor(private db: DbExecutor) {}

  async list(propertyId: string): Promise<AccountView[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.propertyId, propertyId))
      .orderBy(asc(accounts.createdAt));
    const leasesByAccount = await loadLeases(
      this.db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toAccountView(row, leasesByAccount));
  }

  async getById(propertyId: string, id: string): Promise<AccountView | null> {
    const row = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    const leasesByAccount = await loadLeases(this.db, [row.id]);
    return toAccountView(row, leasesByAccount);
  }
}
