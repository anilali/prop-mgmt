import type { BlobStorage } from "@moonship/blob-storage";
import type { DatabaseClient } from "@moonship/db";
import type { EventDispatcher } from "@moonship/events";
import { S3BlobStorage } from "@moonship/blob-storage";
import {
  createPGUnitOfWork,
  PGAccessQueries,
  PGAccountQueries,
  PGAccountRepository,
  PGBillingQueries,
  PGBillingStore,
  PGLeaseDocumentStore,
  PGPlatformAdminRepository,
  PGPropertyAccessRepository,
  PGPropertyQueries,
  PGPropertyRepository,
  PGTenantQueries,
  PGTenantRepository,
  PGUnitQueries,
  PGUnitRepository,
} from "@moonship/db";
import { InMemoryEventDispatcher } from "@moonship/events";
import { ReactPdfStatementRenderer } from "@moonship/statement-pdf";

import type { Operator } from "./operator";
import { loadRequestAccess } from "./operator-context";
import { createTRPCRouter } from "./root";

export interface OperatorAPIConfig {
  db: DatabaseClient;
  eventDispatcher?: EventDispatcher;
  blobStorage?: BlobStorage;
  s3?: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    forcePathStyle?: boolean;
  };
}

export function createOperatorAPI(config: OperatorAPIConfig) {
  const db = config.db;
  const eventDispatcher =
    config.eventDispatcher ?? new InMemoryEventDispatcher();

  const blobStorage =
    config.blobStorage ??
    (config.s3
      ? new S3BlobStorage(config.s3)
      : (() => {
          throw new Error(
            "createOperatorAPI requires blobStorage or s3 config",
          );
        })());

  const propertyRepository = new PGPropertyRepository(db, eventDispatcher);
  const propertyQueries = new PGPropertyQueries(db);
  const unitRepository = new PGUnitRepository(db, eventDispatcher);
  const unitQueries = new PGUnitQueries(db);
  const propertyAccessRepository = new PGPropertyAccessRepository(
    db,
    eventDispatcher,
  );
  const platformAdminRepository = new PGPlatformAdminRepository(db);
  const accessQueries = new PGAccessQueries(db);
  const tenantRepository = new PGTenantRepository(db, eventDispatcher);
  const tenantQueries = new PGTenantQueries(db);
  const accountRepository = new PGAccountRepository(db, eventDispatcher);
  const accountQueries = new PGAccountQueries(db);
  const leaseDocuments = new PGLeaseDocumentStore(db);
  const billingStore = new PGBillingStore(db);
  const billingQueries = new PGBillingQueries(db);
  const unitOfWork = createPGUnitOfWork(db);

  const { appRouter, createTRPCContext, createCallerFactory } =
    createTRPCRouter({
      propertyRepository,
      propertyQueries,
      unitRepository,
      unitQueries,
      propertyAccessRepository,
      accessQueries,
      tenantRepository,
      tenantQueries,
      accountRepository,
      accountQueries,
      leaseDocuments,
      billingStore,
      billingQueries,
      unitOfWork,
      blobStorage,
      statementRenderer: new ReactPdfStatementRenderer(),
    });

  return {
    appRouter,
    createTRPCContext,
    createCallerFactory,
    loadRequestAccess: (input: {
      operator: Operator;
      cookieValue: string | null | undefined;
    }) =>
      loadRequestAccess(
        { accessQueries, platformAdminRepository, propertyQueries },
        input,
      ),
    claimAccessDeps: {
      propertyAccessRepository,
      platformAdminRepository,
      accessQueries,
    },
  };
}
