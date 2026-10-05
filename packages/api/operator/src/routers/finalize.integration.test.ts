import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { seedPropertySetup } from "@moonship/billing";
import {
  createDb,
  createPGUnitOfWork,
  eq,
  PGAccountQueries,
  PGAccountRepository,
  PGBillingQueries,
  PGBillingStore,
  PGLeaseDocumentStore,
  PGPropertyQueries,
  PGPropertyRepository,
  PGTenantQueries,
  PGTenantRepository,
  PGUnitQueries,
  PGUnitRepository,
} from "@moonship/db";
import {
  accountLedgerEntries,
  categories,
  costPools,
  reconciliationStatements,
  reconciliationYears,
  transactions,
} from "@moonship/db/schemas/billing";
import { accounts } from "@moonship/db/schemas/lease-mgmt";
import { properties, units } from "@moonship/db/schemas/property";
import { tenants } from "@moonship/db/schemas/tenant-mgmt";
import { Account } from "@moonship/lease-mgmt";
import { Property, Unit } from "@moonship/property";
import { Tenant } from "@moonship/tenant-mgmt";

import type {
  TransactionalStores,
  UnitOfWork,
  UnitOfWorkOptions,
} from "../unit-of-work";
import { loadRequestAccess } from "../operator-context";
import { createTRPCRouter } from "../root";
import { InMemoryAccessStore, seedAccess } from "../test-access-store";
import { FakeBlobStorage, FakeStatementRenderer } from "../test-billing-store";
import { PROPERTY_ADMIN, TEST_ADDRESS } from "../test-setup-stores";
import { createCallerFactory } from "../trpc";

const databaseUrl = process.env.POSTGRES_URL;

afterEach(() => {
  vi.unstubAllEnvs();
});

function failingAccountSaves(unitOfWork: UnitOfWork): UnitOfWork {
  return {
    run<T>(
      fn: (stores: TransactionalStores) => Promise<T>,
      options?: UnitOfWorkOptions,
    ): Promise<T> {
      return unitOfWork.run(
        (stores) =>
          fn({
            ...stores,
            accountRepository: {
              findById: (propertyId, id) =>
                stores.accountRepository.findById(propertyId, id),
              save: () =>
                Promise.reject(new Error("Simulated account save failure")),
              delete: (propertyId, id) =>
                stores.accountRepository.delete(propertyId, id),
            },
          }),
        options,
      );
    },
  };
}

describe.skipIf(!databaseUrl)("reconciliation.finalize on Postgres", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const pgUnitOfWork = createPGUnitOfWork(db);
  const billingStore = new PGBillingStore(db);
  const billingQueries = new PGBillingQueries(db);
  const propertyQueries = new PGPropertyQueries(db);
  const propertyIds: string[] = [];

  afterAll(async () => {
    for (const propertyId of propertyIds) {
      await db
        .delete(reconciliationStatements)
        .where(eq(reconciliationStatements.propertyId, propertyId));
      await db
        .delete(accountLedgerEntries)
        .where(eq(accountLedgerEntries.propertyId, propertyId));
      await db
        .delete(reconciliationYears)
        .where(eq(reconciliationYears.propertyId, propertyId));
      await db
        .delete(transactions)
        .where(eq(transactions.propertyId, propertyId));
      await db.delete(categories).where(eq(categories.propertyId, propertyId));
      await db.delete(costPools).where(eq(costPools.propertyId, propertyId));
      await db.delete(accounts).where(eq(accounts.propertyId, propertyId));
      await db.delete(tenants).where(eq(tenants.propertyId, propertyId));
      await db.delete(units).where(eq(units.propertyId, propertyId));
      await db.delete(properties).where(eq(properties.id, propertyId));
    }
    await db.$client.end({ timeout: 5 });
  });

  function appFor(propertyId: string, unitOfWork: UnitOfWork) {
    const access = new InMemoryAccessStore();
    access.seed(
      seedAccess(propertyId, [
        {
          id: randomUUID(),
          email: PROPERTY_ADMIN.email,
          role: "admin",
          authUserId: PROPERTY_ADMIN.authUserId,
        },
      ]),
    );
    const blob = new FakeBlobStorage();
    const renderer = new FakeStatementRenderer();
    const { appRouter } = createTRPCRouter({
      propertyRepository: new PGPropertyRepository(db),
      propertyQueries,
      unitRepository: new PGUnitRepository(db),
      unitQueries: new PGUnitQueries(db),
      propertyAccessRepository: access.repository,
      accessQueries: access.queries,
      tenantRepository: new PGTenantRepository(db),
      tenantQueries: new PGTenantQueries(db),
      accountRepository: new PGAccountRepository(db),
      accountQueries: new PGAccountQueries(db),
      leaseDocuments: new PGLeaseDocumentStore(db),
      billingStore,
      billingQueries,
      unitOfWork,
      blobStorage: blob,
      statementRenderer: renderer,
    });
    async function caller() {
      const requestAccess = await loadRequestAccess(
        {
          accessQueries: access.queries,
          platformAdminRepository: access.adminRepository,
          propertyQueries,
        },
        { operator: PROPERTY_ADMIN, cookieValue: propertyId },
      );
      return createCallerFactory(appRouter)({ access: requestAccess });
    }
    return { blob, renderer, caller };
  }

  async function seed() {
    const propertyId = randomUUID();
    propertyIds.push(propertyId);
    const unitId = randomUUID();
    const tenantId = randomUUID();
    const accountId = randomUUID();
    const leaseId = randomUUID();

    await new PGPropertyRepository(db).save(
      Property.create({
        id: propertyId,
        name: "Finalize Test Plaza",
        address: TEST_ADDRESS,
        trackingStartDate: "2024-01-01",
        letter: {
          ownerName: "Pat Owner",
          ownerTitle: "Managing Member",
          companyName: "Finalize Test LLC",
          ownerPhone: "(555) 010-2000",
          ownerEmail: "owner@example.com",
        },
      }),
    );
    await new PGUnitRepository(db).save(
      Unit.create({
        id: unitId,
        propertyId,
        label: "A",
        sqft: 2500,
        address: TEST_ADDRESS,
      }),
    );
    await new PGTenantRepository(db).save(
      Tenant.create({
        id: tenantId,
        propertyId,
        businessName: "Super Lucky LLC",
        mailingAddress: TEST_ADDRESS,
      }),
    );
    const setup = seedPropertySetup({
      propertyId,
      unitIds: [unitId],
      newId: randomUUID,
    });
    for (const pool of setup.pools) await billingStore.savePool(pool);
    for (const category of setup.categories) {
      await billingStore.saveCategory(category);
    }
    const cam = setup.pools.find((pool) => pool.name === "CAM");
    const camCategory = setup.categories.find((c) => c.poolId === cam?.id);
    if (!cam || !camCategory) throw new Error("missing CAM pool");

    await new PGAccountRepository(db).save(
      Account.open(
        {
          id: accountId,
          propertyId,
          tenantId,
          unitId,
          openingBalanceCents: 0,
        },
        {
          id: leaseId,
          startDate: "2024-01-01",
          endDate: "2026-12-31",
          moveOutDate: null,
          lateFee: null,
          insuranceExpiresOn: null,
          rentSteps: [
            { id: randomUUID(), startsOn: "2024-01-01", amountCents: 200_000 },
          ],
          estimateSteps: [
            {
              id: randomUUID(),
              poolId: cam.id,
              startsOn: "2024-01-01",
              amountCents: 90_000,
            },
          ],
        },
      ),
    );
    await billingStore.insertCashExpense({
      id: randomUUID(),
      propertyId,
      postedOn: "2024-03-01",
      description: "Landscaping",
      amountCents: 1_200_000,
      categoryId: camCategory.id,
    });

    return { propertyId, accountId, leaseId, camPoolId: cam.id };
  }

  async function januarySteps(propertyId: string, accountId: string) {
    const view = await new PGAccountQueries(db).getById(propertyId, accountId);
    return (view?.leases ?? []).flatMap((lease) =>
      lease.estimateSteps
        .filter((step) => step.startsOn === "2025-01-01")
        .map((step) => [lease.id, step.poolId, step.amountCents]),
    );
  }

  it("rolls back every write when a step fails after the snapshot inserts", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TODAY_OVERRIDE", "2025-01-08");
    const { propertyId, accountId, leaseId, camPoolId } = await seed();
    const failing = appFor(propertyId, failingAccountSaves(pgUnitOfWork));
    const caller = await failing.caller();
    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });

    await expect(
      caller.reconciliation.finalize({ year: 2024 }),
    ).rejects.toThrow("Simulated account save failure");

    expect(failing.blob.puts).toEqual([
      `reconciliations/${propertyId}/2024/${accountId}.pdf`,
    ]);
    expect(await billingQueries.listStatementSnapshots(propertyId)).toEqual([]);
    expect(await billingQueries.listLedgerEntries(propertyId)).toEqual([]);
    expect(await januarySteps(propertyId, accountId)).toEqual([]);
    const [year] = await billingQueries.listReconciliationYears(propertyId);
    expect(year).toMatchObject({
      status: "draft",
      letterDate: "2025-01-01",
      finalizedAt: null,
    });
    expect(await billingQueries.listFinalizedYears(propertyId)).toEqual([]);

    const working = appFor(propertyId, pgUnitOfWork);
    const result = await (
      await working.caller()
    ).reconciliation.finalize({ year: 2024 });

    expect(result.statements).toEqual([
      expect.objectContaining({
        accountId,
        trueUpCents: 120_000,
        newMonthlyRentCents: 300_000,
        newEstimateSteps: 1,
      }),
    ]);
    const snapshots = await billingQueries.listStatementSnapshots(propertyId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      year: 2024,
      accountId,
      trueUpCents: 120_000,
      pdfStorageKey: `reconciliations/${propertyId}/2024/${accountId}.pdf`,
    });
    expect(snapshots[0]?.data.continuing?.newMonthlyRentCents).toBe(300_000);
    expect(
      (await billingQueries.listLedgerEntries(propertyId)).map((e) => [
        e.kind,
        e.entryDate,
        e.amountCents,
      ]),
    ).toEqual([["true_up", "2025-01-01", 120_000]]);
    expect(await januarySteps(propertyId, accountId)).toEqual([
      [leaseId, camPoolId, 100_000],
    ]);
    expect(await billingQueries.listFinalizedYears(propertyId)).toEqual([2024]);

    await expect(
      (await working.caller()).reconciliation.finalize({ year: 2024 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await billingQueries.listStatementSnapshots(propertyId),
    ).toHaveLength(1);
  });

  it("lets one of two concurrent finalize calls win and the other get CONFLICT", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TODAY_OVERRIDE", "2025-01-08");
    const { propertyId, accountId } = await seed();
    const first = appFor(propertyId, pgUnitOfWork);
    const second = appFor(propertyId, pgUnitOfWork);
    await (
      await first.caller()
    ).reconciliation.setLetterDate({ year: 2024, letterDate: "2025-01-01" });
    const [firstCaller, secondCaller] = await Promise.all([
      first.caller(),
      second.caller(),
    ]);

    const [firstResult, secondResult] = await Promise.allSettled([
      firstCaller.reconciliation.finalize({ year: 2024 }),
      secondCaller.reconciliation.finalize({ year: 2024 }),
    ]);
    const results = [firstResult, secondResult];

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: "CONFLICT" });

    const winner = firstResult.status === "fulfilled" ? first : second;
    const loser = winner === first ? second : first;
    const key = `reconciliations/${propertyId}/2024/${accountId}.pdf`;
    expect(winner.blob.puts).toEqual([key]);
    expect(loser.blob.puts).toEqual([]);

    const snapshots = await billingQueries.listStatementSnapshots(propertyId);
    expect(snapshots).toHaveLength(1);
    expect(
      (await billingQueries.listLedgerEntries(propertyId)).filter(
        (e) => e.kind === "true_up",
      ),
    ).toHaveLength(1);
    expect(await januarySteps(propertyId, accountId)).toHaveLength(1);
    expect(snapshots.map((s) => s.data)).toEqual(winner.renderer.rendered);
    expect(loser.renderer.rendered).toEqual([]);
  });

  it("stores the snapshot data the renderer received", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TODAY_OVERRIDE", "2025-01-08");
    const { propertyId } = await seed();
    const app = appFor(propertyId, pgUnitOfWork);
    const caller = await app.caller();
    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });

    await caller.reconciliation.finalize({ year: 2024 });

    const snapshots = await billingQueries.listStatementSnapshots(propertyId);
    expect(app.renderer.rendered).toHaveLength(1);
    expect(snapshots.map((s) => s.data)).toEqual(app.renderer.rendered);
  });

  it("rejects a lease save made from a copy loaded before finalize", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TODAY_OVERRIDE", "2025-01-08");
    const { propertyId, accountId, leaseId } = await seed();
    const caller = await appFor(propertyId, pgUnitOfWork).caller();
    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });
    const opened = await caller.account.get({ id: accountId });

    await caller.reconciliation.finalize({ year: 2024 });

    await expect(
      caller.lease.setRentStepNotified({
        accountId,
        expectedVersion: opened.account.version,
        leaseId,
        stepId: opened.account.leases[0]?.rentSteps[0]?.id ?? "",
        notified: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await januarySteps(propertyId, accountId)).toHaveLength(1);
  });

  it("dates an adjustment inside the finalized year on the save day", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TODAY_OVERRIDE", "2025-01-08");
    const { propertyId, accountId } = await seed();
    const caller = await appFor(propertyId, pgUnitOfWork).caller();
    await caller.reconciliation.setLetterDate({
      year: 2024,
      letterDate: "2025-01-01",
    });
    await caller.reconciliation.finalize({ year: 2024 });

    const result = await caller.rent.addAdjustment({
      accountId,
      date: "2024-06-01",
      amountCents: 5_000,
      note: "Missed June charge",
    });

    expect(result.movedFrom).toBe("2024-06-01");
    expect(result.entry.entryDate).toBe("2025-01-08");
    expect(
      (await billingQueries.getLedgerEntry(propertyId, result.entry.id))
        ?.entryDate,
    ).toBe("2025-01-08");
    const workspace = await caller.reconciliation.workspace({ year: 2024 });
    expect(workspace.finalized?.mismatchCount).toBe(0);
  });
});
