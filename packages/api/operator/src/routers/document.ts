import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BlobStorage, ObjectInfo } from "@moonship/blob-storage";
import type {
  AccountQueries,
  LeaseDocument,
  LeaseDocumentStore,
} from "@moonship/lease-mgmt";
import { attachmentDisposition } from "@moonship/blob-storage";
import {
  LEASE_DOCUMENT_CONTENT_TYPE,
  leaseDocumentFileProblem,
  leaseDocumentStorageKey,
} from "@moonship/lease-mgmt";

import { badRequest, conflict, notFound, storageUnavailable } from "../errors";
import { idSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface DocumentRouterDeps {
  accountQueries: AccountQueries;
  leaseDocuments: LeaseDocumentStore;
  blobStorage: BlobStorage;
}

const UPLOAD_URL_SECONDS = 900;
const DOWNLOAD_URL_SECONDS = 3600;

const uploadInput = z.object({
  accountId: idSchema,
  leaseId: idSchema.nullable().optional(),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().trim().max(100),
});

type UploadInput = z.infer<typeof uploadInput>;

const documentInput = z.object({ documentId: idSchema });

function toView(document: LeaseDocument) {
  return {
    id: document.id,
    accountId: document.accountId,
    leaseId: document.leaseId,
    fileName: document.fileName,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt,
  };
}

function storedFileProblem(
  stored: ObjectInfo,
  input: { fileName: string; sizeBytes: number },
): string | null {
  const fileProblem = leaseDocumentFileProblem(stored);
  if (fileProblem) return fileProblem;
  if (stored.sizeBytes !== input.sizeBytes) {
    return "The uploaded file is not the size that was expected. Try again.";
  }
  if (stored.contentDisposition !== attachmentDisposition(input.fileName)) {
    return "The upload did not keep the file name. Try again.";
  }
  return null;
}

async function withStorage<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw storageUnavailable(error);
  }
}

export function documentRouter(deps: DocumentRouterDeps) {
  async function checkUpload(propertyId: string, input: UploadInput) {
    const account = await deps.accountQueries.getById(
      propertyId,
      input.accountId,
    );
    if (!account) throw notFound("Account not found");
    const leaseId = input.leaseId ?? null;
    if (leaseId && !account.leases.some((lease) => lease.id === leaseId)) {
      throw notFound("Lease not found on this account");
    }
    const problem = leaseDocumentFileProblem(input);
    if (problem) throw badRequest(problem);
    return leaseId;
  }

  async function loadDocument(propertyId: string, documentId: string) {
    const document = await deps.leaseDocuments.getById(propertyId, documentId);
    if (!document) throw notFound("Document not found");
    return document;
  }

  return router({
    list: propertyProcedure
      .input(z.object({ accountId: idSchema }))
      .query(async ({ ctx, input }) => {
        const account = await deps.accountQueries.getById(
          ctx.propertyId,
          input.accountId,
        );
        if (!account) throw notFound("Account not found");
        const [documents, storageReady] = await Promise.all([
          deps.leaseDocuments.listForAccount(ctx.propertyId, input.accountId),
          deps.blobStorage.isAvailable(),
        ]);
        return { storageReady, documents: documents.map(toView) };
      }),

    createUpload: propertyProcedure
      .input(uploadInput)
      .mutation(async ({ ctx, input }) => {
        await checkUpload(ctx.propertyId, input);
        if (!(await deps.blobStorage.isAvailable())) {
          throw storageUnavailable();
        }
        const documentId = randomUUID();
        const upload = await withStorage(() =>
          deps.blobStorage.getSignedUploadUrl(
            leaseDocumentStorageKey(
              ctx.propertyId,
              input.accountId,
              documentId,
            ),
            {
              contentType: LEASE_DOCUMENT_CONTENT_TYPE,
              contentLength: input.sizeBytes,
              fileName: input.fileName,
              expiresInSeconds: UPLOAD_URL_SECONDS,
            },
          ),
        );
        return {
          documentId,
          uploadUrl: upload.url,
          headers: upload.headers,
          expiresInSeconds: UPLOAD_URL_SECONDS,
        };
      }),

    confirmUpload: propertyProcedure
      .input(uploadInput.extend({ documentId: idSchema }))
      .mutation(async ({ ctx, input }) => {
        const leaseId = await checkUpload(ctx.propertyId, input);
        if (
          await deps.leaseDocuments.getById(ctx.propertyId, input.documentId)
        ) {
          throw conflict("This document is already saved");
        }
        const storageKey = leaseDocumentStorageKey(
          ctx.propertyId,
          input.accountId,
          input.documentId,
        );
        const stored = await withStorage(() =>
          deps.blobStorage.headObject(storageKey),
        );
        if (!stored) {
          throw badRequest("The upload did not finish. Try again.");
        }
        const problem = storedFileProblem(stored, input);
        if (problem) {
          await withStorage(() => deps.blobStorage.deleteObject(storageKey));
          throw badRequest(problem);
        }
        const document: LeaseDocument = {
          id: input.documentId,
          propertyId: ctx.propertyId,
          accountId: input.accountId,
          leaseId,
          fileName: input.fileName,
          contentType: LEASE_DOCUMENT_CONTENT_TYPE,
          sizeBytes: stored.sizeBytes,
          storageKey,
          uploadedAt: new Date(),
        };
        await deps.leaseDocuments.insert(document);
        return toView(document);
      }),

    downloadUrl: propertyProcedure
      .input(documentInput)
      .mutation(async ({ ctx, input }) => {
        const document = await loadDocument(ctx.propertyId, input.documentId);
        const url = await withStorage(() =>
          deps.blobStorage.getSignedDownloadUrl(document.storageKey, {
            expiresInSeconds: DOWNLOAD_URL_SECONDS,
            fileName: document.fileName,
          }),
        );
        return {
          url,
          fileName: document.fileName,
          expiresInSeconds: DOWNLOAD_URL_SECONDS,
        };
      }),

    remove: propertyProcedure
      .input(documentInput)
      .mutation(async ({ ctx, input }) => {
        const document = await loadDocument(ctx.propertyId, input.documentId);
        await withStorage(() =>
          deps.blobStorage.deleteObject(document.storageKey),
        );
        await deps.leaseDocuments.delete(ctx.propertyId, document.id);
        return { ok: true as const };
      }),
  });
}
