import type { LeaseDocument } from "../documents/lease-document";

export interface LeaseDocumentStore {
  listForAccount(
    propertyId: string,
    accountId: string,
  ): Promise<LeaseDocument[]>;
  getById(propertyId: string, id: string): Promise<LeaseDocument | null>;
  insert(document: LeaseDocument): Promise<void>;
  delete(propertyId: string, id: string): Promise<void>;
  accountHasDocuments(propertyId: string, accountId: string): Promise<boolean>;
}
