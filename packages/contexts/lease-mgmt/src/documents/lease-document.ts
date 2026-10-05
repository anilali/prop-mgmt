import { formatFileSize } from "@moonship/shared";

export interface LeaseDocument {
  id: string;
  propertyId: string;
  accountId: string;
  leaseId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: Date;
}

export const LEASE_DOCUMENT_CONTENT_TYPE = "application/pdf";

export const LEASE_DOCUMENT_MAX_BYTES = 25_000_000;

export function leaseDocumentStorageKey(
  propertyId: string,
  accountId: string,
  documentId: string,
): string {
  return `documents/${propertyId}/${accountId}/${documentId}.pdf`;
}

export function leaseDocumentFileProblem(file: {
  contentType: string | null;
  sizeBytes: number;
}): string | null {
  if (file.contentType !== LEASE_DOCUMENT_CONTENT_TYPE) {
    return "Only PDF files can be uploaded";
  }
  if (file.sizeBytes <= 0) {
    return "The file is empty";
  }
  if (file.sizeBytes > LEASE_DOCUMENT_MAX_BYTES) {
    return `The file is ${formatFileSize(file.sizeBytes)}. The limit is ${formatFileSize(LEASE_DOCUMENT_MAX_BYTES)}.`;
  }
  return null;
}
