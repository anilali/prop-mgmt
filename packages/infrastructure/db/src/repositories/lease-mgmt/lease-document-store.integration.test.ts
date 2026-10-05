import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { LeaseDocument } from "@moonship/lease-mgmt";
import { Account, leaseDocumentStorageKey } from "@moonship/lease-mgmt";

import { createDb } from "../../client";
import { accounts } from "../../schemas/lease-mgmt/schema";
import { PGAccountRepository } from "./account-repository";
import { PGLeaseDocumentStore } from "./lease-document-store";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("PGLeaseDocumentStore", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const accountRepo = new PGAccountRepository(db);
  const store = new PGLeaseDocumentStore(db);
  const accountIds: string[] = [];

  afterAll(async () => {
    if (accountIds.length > 0) {
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    }
    await db.$client.end({ timeout: 5 });
  });

  function lease(startDate: string, endDate: string) {
    return {
      id: randomUUID(),
      startDate,
      endDate,
      moveOutDate: null,
      lateFee: null,
      insuranceExpiresOn: null,
      rentSteps: [{ id: randomUUID(), startsOn: startDate, amountCents: 1000 }],
      estimateSteps: [],
    };
  }

  async function openAccount() {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    accountIds.push(accountId);
    const first = lease("2024-01-01", "2024-12-31");
    const second = lease("2025-01-01", "2025-12-31");
    const account = Account.open(
      {
        id: accountId,
        propertyId,
        tenantId: randomUUID(),
        unitId: randomUUID(),
        openingBalanceCents: 0,
      },
      first,
    );
    account.addLease(second);
    await accountRepo.save(account);
    return {
      propertyId,
      accountId,
      firstLeaseId: first.id,
      secondLeaseId: second.id,
    };
  }

  function document(
    propertyId: string,
    accountId: string,
    leaseId: string | null,
    uploadedAt: Date,
  ): LeaseDocument {
    const id = randomUUID();
    return {
      id,
      propertyId,
      accountId,
      leaseId,
      fileName: `Lease ${id.slice(0, 4)}.pdf`,
      contentType: "application/pdf",
      sizeBytes: 7_812_345,
      storageKey: leaseDocumentStorageKey(propertyId, accountId, id),
      uploadedAt,
    };
  }

  it("round-trips documents newest first, scoped by property", async () => {
    const { propertyId, accountId, firstLeaseId } = await openAccount();
    const older = document(
      propertyId,
      accountId,
      firstLeaseId,
      new Date("2026-10-01T10:00:00.000Z"),
    );
    const newer = document(
      propertyId,
      accountId,
      null,
      new Date("2026-10-05T10:00:00.000Z"),
    );
    await store.insert(older);
    await store.insert(newer);

    expect(await store.listForAccount(propertyId, accountId)).toEqual([
      newer,
      older,
    ]);
    expect(await store.getById(propertyId, older.id)).toEqual(older);
    expect(await store.accountHasDocuments(propertyId, accountId)).toBe(true);

    const otherProperty = randomUUID();
    expect(await store.getById(otherProperty, older.id)).toBeNull();
    expect(await store.listForAccount(otherProperty, accountId)).toEqual([]);
    expect(await store.accountHasDocuments(otherProperty, accountId)).toBe(
      false,
    );
    await store.delete(otherProperty, older.id);
    expect(await store.getById(propertyId, older.id)).toEqual(older);

    await store.delete(propertyId, older.id);
    expect(await store.listForAccount(propertyId, accountId)).toEqual([newer]);
  });

  it("rejects an empty file", async () => {
    const { propertyId, accountId } = await openAccount();
    await expect(
      store.insert({
        ...document(propertyId, accountId, null, new Date()),
        sizeBytes: 0,
      }),
    ).rejects.toThrow();
  });

  it("clears the lease when the lease is removed and goes with the account", async () => {
    const { propertyId, accountId, secondLeaseId } = await openAccount();
    const tagged = document(propertyId, accountId, secondLeaseId, new Date());
    await store.insert(tagged);

    const account = await accountRepo.findById(propertyId, accountId);
    if (!account) throw new Error("missing account");
    account.removeLease(secondLeaseId);
    await accountRepo.save(account);
    expect((await store.getById(propertyId, tagged.id))?.leaseId).toBeNull();

    await accountRepo.delete(propertyId, accountId);
    expect(await store.getById(propertyId, tagged.id)).toBeNull();
  });
});
