import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { Account, StaleAccountError } from "@moonship/lease-mgmt";

import { createDb } from "../../client";
import { PGAccountQueries } from "../../queries/lease-mgmt/account-queries";
import {
  accounts,
  leaseEstimateSteps,
  leaseFixedChargeSteps,
  leaseRentSteps,
  leases,
} from "../../schemas/lease-mgmt/schema";
import { PGAccountRepository } from "./account-repository";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("PGAccountRepository", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const repo = new PGAccountRepository(db);
  const queries = new PGAccountQueries(db);
  const accountIds: string[] = [];

  afterAll(async () => {
    if (accountIds.length > 0) {
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    }
    await db.$client.end({ timeout: 5 });
  });

  function openAccount() {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    accountIds.push(accountId);
    const poolId = randomUUID();
    const firstLeaseId = randomUUID();
    const account = Account.open(
      {
        id: accountId,
        propertyId,
        tenantId: randomUUID(),
        unitId: randomUUID(),
        openingBalanceCents: -36_279,
      },
      {
        id: firstLeaseId,
        startDate: "2023-06-15",
        endDate: "2024-06-14",
        moveOutDate: null,
        lateFee: { amountCents: 5000, day: 10 },
        insuranceExpiresOn: "2024-11-30",
        rentSteps: [
          { id: randomUUID(), startsOn: "2023-06-15", amountCents: 300_000 },
          { id: randomUUID(), startsOn: "2024-01-01", amountCents: 310_000 },
        ],
        estimateSteps: [
          {
            id: randomUUID(),
            poolId,
            startsOn: "2023-06-15",
            amountCents: 22_000,
          },
        ],
        fixedChargeSteps: [
          {
            id: randomUUID(),
            name: "Trash",
            startsOn: "2023-06-15",
            amountCents: 5_000,
          },
          {
            id: randomUUID(),
            name: "Sign",
            startsOn: "2023-06-15",
            amountCents: 3_500,
          },
          {
            id: randomUUID(),
            name: "Sign",
            startsOn: "2024-01-01",
            amountCents: 4_000,
          },
        ],
      },
    );
    return { account, propertyId, accountId, poolId, firstLeaseId };
  }

  it("round-trips leases and steps with ids and tenant_notified_at", async () => {
    const { account, propertyId, accountId, poolId, firstLeaseId } =
      openAccount();
    const secondLeaseId = randomUUID();
    account.addLease({
      id: secondLeaseId,
      startDate: "2024-06-15",
      endDate: "2025-06-14",
      moveOutDate: null,
      lateFee: null,
      insuranceExpiresOn: null,
      rentSteps: [
        { id: randomUUID(), startsOn: "2024-06-15", amountCents: 315_000 },
      ],
      estimateSteps: [
        {
          id: randomUUID(),
          poolId,
          startsOn: "2024-07-01",
          amountCents: 23_000,
        },
      ],
      fixedChargeSteps: [],
    });
    const notifiedStep = account.findLease(firstLeaseId)?.rentSteps[1];
    if (!notifiedStep) throw new Error("missing rent step");
    const notifiedAt = new Date("2023-11-01T15:30:00.000Z");
    account.markRentStepNotified(firstLeaseId, notifiedStep.id, notifiedAt);
    await repo.save(account);

    const loaded = await repo.findById(propertyId, accountId);
    expect(loaded?.openingBalanceCents).toBe(-36_279);
    expect(loaded?.leases).toEqual(account.leases);
    expect(
      loaded
        ?.findLease(firstLeaseId)
        ?.fixedChargeSteps.map((step) => [step.name, step.startsOn]),
    ).toEqual([
      ["Sign", "2023-06-15"],
      ["Sign", "2024-01-01"],
      ["Trash", "2023-06-15"],
    ]);
    expect(
      loaded?.findLease(firstLeaseId)?.rentSteps[1]?.tenantNotifiedAt,
    ).toEqual(notifiedAt);

    if (!loaded) throw new Error("missing account");
    const keptCharges = (loaded.findLease(firstLeaseId)?.fixedChargeSteps ?? [])
      .filter((step) => step.name === "Sign")
      .map((step) => ({ ...step, amountCents: step.amountCents + 100 }));
    const editedTerms = {
      startDate: "2023-06-15",
      endDate: "2024-06-14",
      moveOutDate: null,
      lateFee: { amountCents: 7500, day: 5 },
      insuranceExpiresOn: null,
      estimateSteps: [],
      fixedChargeSteps: keptCharges,
    };
    loaded.updateLease(firstLeaseId, {
      ...editedTerms,
      rentSteps: [
        { id: randomUUID(), startsOn: "2023-06-15", amountCents: 300_000 },
        { id: randomUUID(), startsOn: "2024-01-01", amountCents: 310_000 },
      ],
    });
    await repo.save(loaded);

    const reloaded = await repo.findById(propertyId, accountId);
    const firstLease = reloaded?.findLease(firstLeaseId);
    expect(firstLease?.rentSteps[1]?.id).toBe(notifiedStep.id);
    expect(firstLease?.rentSteps[1]?.tenantNotifiedAt).toEqual(notifiedAt);
    expect(firstLease?.lateFee).toEqual({ amountCents: 7500, day: 5 });
    expect(firstLease?.estimateSteps).toEqual([]);
    expect(firstLease?.fixedChargeSteps).toEqual(keptCharges);

    if (!reloaded) throw new Error("missing account");
    reloaded.updateLease(firstLeaseId, {
      ...editedTerms,
      rentSteps: [
        { id: randomUUID(), startsOn: "2023-06-15", amountCents: 300_000 },
        { id: randomUUID(), startsOn: "2024-01-01", amountCents: 312_000 },
      ],
    });
    await repo.save(reloaded);

    const repriced = (await repo.findById(propertyId, accountId))?.findLease(
      firstLeaseId,
    );
    expect(repriced?.rentSteps[1]?.id).toBe(notifiedStep.id);
    expect(repriced?.rentSteps[1]?.amountCents).toBe(312_000);
    expect(repriced?.rentSteps[1]?.tenantNotifiedAt).toBeNull();

    const view = await queries.getById(propertyId, accountId);
    expect(view?.leases.map((l) => l.id)).toEqual([
      firstLeaseId,
      secondLeaseId,
    ]);
    expect(await queries.getById(randomUUID(), accountId)).toBeNull();
  });

  it("bumps the version on each save and rejects a stale copy", async () => {
    const { account, propertyId, accountId } = openAccount();
    await repo.save(account);
    expect(account.version).toBe(1);

    const first = await repo.findById(propertyId, accountId);
    const second = await repo.findById(propertyId, accountId);
    if (!first || !second) throw new Error("missing account");
    expect(first.version).toBe(1);

    first.setOpeningBalance(100);
    await repo.save(first);
    expect((await queries.getById(propertyId, accountId))?.version).toBe(2);

    second.setOpeningBalance(200);
    await expect(repo.save(second)).rejects.toThrow(StaleAccountError);
    expect(
      (await queries.getById(propertyId, accountId))?.openingBalanceCents,
    ).toBe(100);

    const other = await repo.findById(propertyId, accountId);
    if (!other) throw new Error("missing account");
    const moved = Account.reconstitute({
      id: accountId,
      propertyId: randomUUID(),
      tenantId: other.tenantId,
      unitId: other.unitId,
      openingBalanceCents: 0,
      version: other.version,
      leases: other.leases,
    });
    await expect(repo.save(moved)).rejects.toThrow(
      "belongs to another property",
    );
  });

  it("deletes a removed lease with its steps", async () => {
    const { account, propertyId, accountId, firstLeaseId } = openAccount();
    const secondLeaseId = randomUUID();
    account.addLease({
      id: secondLeaseId,
      startDate: "2024-06-15",
      endDate: "2025-06-14",
      moveOutDate: null,
      lateFee: null,
      insuranceExpiresOn: null,
      rentSteps: [
        { id: randomUUID(), startsOn: "2024-06-15", amountCents: 315_000 },
      ],
      estimateSteps: [],
      fixedChargeSteps: [],
    });
    await repo.save(account);

    account.removeLease(firstLeaseId);
    await repo.save(account);

    const loaded = await repo.findById(propertyId, accountId);
    expect(loaded?.leases.map((l) => l.id)).toEqual([secondLeaseId]);
    expect(
      await db.select().from(leases).where(eq(leases.id, firstLeaseId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(leaseRentSteps)
        .where(eq(leaseRentSteps.leaseId, firstLeaseId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(leaseEstimateSteps)
        .where(eq(leaseEstimateSteps.leaseId, firstLeaseId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(leaseFixedChargeSteps)
        .where(eq(leaseFixedChargeSteps.leaseId, firstLeaseId)),
    ).toHaveLength(0);
  });

  it("deletes an account with its leases and steps", async () => {
    const { account, propertyId, accountId, firstLeaseId } = openAccount();
    await repo.save(account);

    await repo.delete(propertyId, accountId);

    expect(await repo.findById(propertyId, accountId)).toBeNull();
    expect(
      await db
        .select()
        .from(leaseRentSteps)
        .where(eq(leaseRentSteps.leaseId, firstLeaseId)),
    ).toHaveLength(0);
  });
});
