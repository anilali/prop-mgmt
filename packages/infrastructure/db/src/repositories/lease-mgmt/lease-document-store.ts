import { and, desc, eq } from "drizzle-orm";

import type { LeaseDocument, LeaseDocumentStore } from "@moonship/lease-mgmt";

import type { DbExecutor } from "../../client";
import { leaseDocuments } from "../../schemas/lease-mgmt/schema";

type LeaseDocumentRow = typeof leaseDocuments.$inferSelect;

function toLeaseDocument(row: LeaseDocumentRow): LeaseDocument {
  return {
    id: row.id,
    propertyId: row.propertyId,
    accountId: row.accountId,
    leaseId: row.leaseId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    uploadedAt: row.uploadedAt,
  };
}

export class PGLeaseDocumentStore implements LeaseDocumentStore {
  constructor(private db: DbExecutor) {}

  async listForAccount(
    propertyId: string,
    accountId: string,
  ): Promise<LeaseDocument[]> {
    const rows = await this.db
      .select()
      .from(leaseDocuments)
      .where(
        and(
          eq(leaseDocuments.propertyId, propertyId),
          eq(leaseDocuments.accountId, accountId),
        ),
      )
      .orderBy(desc(leaseDocuments.uploadedAt), desc(leaseDocuments.id));
    return rows.map(toLeaseDocument);
  }

  async getById(propertyId: string, id: string): Promise<LeaseDocument | null> {
    const [row] = await this.db
      .select()
      .from(leaseDocuments)
      .where(
        and(
          eq(leaseDocuments.id, id),
          eq(leaseDocuments.propertyId, propertyId),
        ),
      )
      .limit(1);
    return row ? toLeaseDocument(row) : null;
  }

  async insert(document: LeaseDocument): Promise<void> {
    await this.db.insert(leaseDocuments).values({
      id: document.id,
      propertyId: document.propertyId,
      accountId: document.accountId,
      leaseId: document.leaseId,
      fileName: document.fileName,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      storageKey: document.storageKey,
      uploadedAt: document.uploadedAt,
    });
  }

  async delete(propertyId: string, id: string): Promise<void> {
    await this.db
      .delete(leaseDocuments)
      .where(
        and(
          eq(leaseDocuments.id, id),
          eq(leaseDocuments.propertyId, propertyId),
        ),
      );
  }

  async accountHasDocuments(
    propertyId: string,
    accountId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: leaseDocuments.id })
      .from(leaseDocuments)
      .where(
        and(
          eq(leaseDocuments.propertyId, propertyId),
          eq(leaseDocuments.accountId, accountId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
