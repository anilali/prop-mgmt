import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { AccountTerms } from "@moonship/billing";
import type { AccountView } from "@moonship/lease-mgmt";
import {
  accountEntries,
  accountPayments,
  balanceOn,
  DuplicateLedgerEntryError,
  monthsDue,
} from "@moonship/billing";
import { Account } from "@moonship/lease-mgmt";

import { createDb } from "../../client";
import { PGBillingStore } from "../../repositories/billing/billing-store";
import { PGAccountRepository } from "../../repositories/lease-mgmt/account-repository";
import {
  accountLedgerEntries,
  bankAccounts,
  importBatches,
  reconciliationYears,
  transactions,
} from "../../schemas/billing/schema";
import { accounts } from "../../schemas/lease-mgmt/schema";
import { createPGUnitOfWork } from "../../unit-of-work";
import { PGAccountQueries } from "../lease-mgmt/account-queries";
import { PGBillingQueries } from "./billing-queries";

const databaseUrl = process.env.POSTGRES_URL;

const TRACKING_START = "2024-01-01";
const AS_OF = "2024-12-31";

function toTerms(view: AccountView): AccountTerms {
  return {
    accountId: view.id,
    tenantId: view.tenantId,
    unitId: view.unitId,
    openingBalanceCents: view.openingBalanceCents,
    leases: view.leases.map((lease) => ({
      leaseId: lease.id,
      startDate: lease.startDate,
      endDate: lease.endDate,
      moveOutDate: lease.moveOutDate,
      lateFee: lease.lateFee,
      insuranceExpiresOn: lease.insuranceExpiresOn,
      rentSteps: lease.rentSteps,
      estimateSteps: lease.estimateSteps,
      fixedChargeSteps: lease.fixedChargeSteps,
    })),
  };
}

function estimates(startsOn: string, amounts: [string, number][]) {
  return amounts.map(([poolId, amountCents]) => ({
    id: randomUUID(),
    poolId,
    startsOn,
    amountCents,
  }));
}

describe.skipIf(!databaseUrl)("balance through PGBillingQueries", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const unitOfWork = createPGUnitOfWork(db);
  const store = new PGBillingStore(db);
  const queries = new PGBillingQueries(db);
  const accountRepository = new PGAccountRepository(db);
  const accountQueries = new PGAccountQueries(db);
  const propertyIds: string[] = [];
  const accountIds: string[] = [];

  afterAll(async () => {
    if (propertyIds.length > 0) {
      await db
        .delete(accountLedgerEntries)
        .where(inArray(accountLedgerEntries.propertyId, propertyIds));
      await db
        .delete(reconciliationYears)
        .where(inArray(reconciliationYears.propertyId, propertyIds));
      await db
        .delete(transactions)
        .where(inArray(transactions.propertyId, propertyIds));
      await db
        .delete(importBatches)
        .where(inArray(importBatches.propertyId, propertyIds));
      await db
        .delete(bankAccounts)
        .where(inArray(bankAccounts.propertyId, propertyIds));
    }
    if (accountIds.length > 0) {
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    }
    await db.$client.end({ timeout: 5 });
  });

  async function seedTenantB() {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    propertyIds.push(propertyId);
    accountIds.push(accountId);
    const [cam, taxes, insurance, water] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    const account = Account.open(
      {
        id: accountId,
        propertyId,
        tenantId: randomUUID(),
        unitId: randomUUID(),
        openingBalanceCents: 25_000,
      },
      {
        id: randomUUID(),
        startDate: "2021-06-01",
        endDate: "2024-05-31",
        moveOutDate: null,
        lateFee: null,
        insuranceExpiresOn: null,
        rentSteps: [
          { id: randomUUID(), startsOn: "2021-06-01", amountCents: 300_000 },
        ],
        estimateSteps: estimates("2021-06-01", [
          [cam, 22_000],
          [taxes, 61_000],
          [insurance, 9_000],
          [water, 15_000],
        ]),
        fixedChargeSteps: [],
      },
    );
    account.addLease({
      id: randomUUID(),
      startDate: "2024-06-01",
      endDate: "2029-05-31",
      moveOutDate: null,
      lateFee: { amountCents: 5_000, day: 10 },
      insuranceExpiresOn: "2025-06-30",
      rentSteps: [
        { id: randomUUID(), startsOn: "2024-06-01", amountCents: 315_000 },
        { id: randomUUID(), startsOn: "2025-06-01", amountCents: 324_450 },
      ],
      estimateSteps: estimates("2024-06-01", [
        [cam, 23_000],
        [taxes, 64_000],
        [insurance, 9_500],
        [water, 16_000],
      ]),
      fixedChargeSteps: [],
    });
    await accountRepository.save(account);

    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: randomUUID(),
      postedOn: `2024-${String(index + 1).padStart(2, "0")}-01`,
      description: "CHECK TENANT B",
      descriptionKey: "check tenant b",
      amountCents: index < 5 ? 407_000 : 427_500,
      externalId: null,
      rawRowHash: `hash-${index}`,
    }));
    await unitOfWork.run(async ({ billing }) => {
      const bankAccount = await billing.lockBankAccount(propertyId);
      await billing.insertImportBatch(
        {
          id: randomUUID(),
          propertyId,
          bankAccountId: bankAccount.id,
          fileName: "2024.csv",
          format: "csv",
          accountLast4: null,
          importedAt: new Date(),
          rowCount: rows.length,
          insertedCount: rows.length,
          duplicateCount: 0,
          beforeTrackingStartCount: 0,
          notTransactionCount: 0,
          firstPostedOn: "2024-01-01",
          lastPostedOn: "2024-12-01",
        },
        rows,
      );
    });
    for (const row of rows) {
      await store.replaceAllocations(propertyId, row.id, [
        { accountId, categoryId: null, amountCents: row.amountCents },
      ]);
    }

    for (const entry of [
      {
        kind: "adjustment" as const,
        entryDate: "2024-03-15",
        amountCents: -12_500,
        note: "Credit for a broken door",
        feeMonth: null,
      },
      {
        kind: "late_fee" as const,
        entryDate: "2024-07-11",
        amountCents: 5_000,
        note: null,
        feeMonth: "2024-07",
      },
      {
        kind: "late_fee_dismissed" as const,
        entryDate: "2024-08-11",
        amountCents: 0,
        note: null,
        feeMonth: "2024-08",
      },
      {
        kind: "adjustment" as const,
        entryDate: "2025-02-01",
        amountCents: 9_999,
        note: "After the date",
        feeMonth: null,
      },
    ]) {
      await store.insertLedgerEntry({
        id: randomUUID(),
        propertyId,
        accountId,
        reconciliationYearId: null,
        ...entry,
      });
    }
    return { propertyId, accountId };
  }

  it("matches a plain SQL sum of opening balance, entries, and payments plus the months", async () => {
    const { propertyId, accountId } = await seedTenantB();

    const view = await accountQueries.getById(propertyId, accountId);
    if (!view) throw new Error("missing account");
    const terms = toTerms(view);
    const ledger = {
      account: terms,
      trackingStart: TRACKING_START,
      payments: accountPayments(
        await queries.listTransactions(propertyId),
        accountId,
      ),
      entries: accountEntries(
        await queries.listLedgerEntries(propertyId),
        accountId,
      ),
    };
    const computed = balanceOn(ledger, AS_OF);

    const result = await db.execute<{ total: string }>(sql`
      select
        (select opening_balance_cents from lease_mgmt.accounts where id = ${accountId})
        + coalesce((
          select sum(amount_cents) from billing.account_ledger_entries
          where account_id = ${accountId} and entry_date <= ${AS_OF}
        ), 0)
        - coalesce((
          select sum(a.amount_cents)
          from billing.transaction_allocations a
          join billing.transactions t on t.id = a.transaction_id
          where a.account_id = ${accountId}
            and t.posted_on between ${TRACKING_START} and ${AS_OF}
        ), 0) as total
    `);
    const months = monthsDue(terms, TRACKING_START, AS_OF);
    const monthsTotal = months.reduce((sum, m) => sum + m.totalCents, 0);

    expect(months).toHaveLength(12);
    expect(monthsTotal).toBe(5_027_500);
    expect(computed).toBe(Number(result[0]?.total) + monthsTotal);
    expect(computed).toBe(25_000 - 12_500 + 5_000);
    expect(await queries.accountHasActivity(propertyId, accountId)).toBe(true);
    expect(await queries.hasTransactionsOrLedgerEntries(propertyId)).toBe(true);
  });

  it("finds activity and updates and deletes an adjustment", async () => {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    propertyIds.push(propertyId);
    expect(await queries.hasTransactionsOrLedgerEntries(propertyId)).toBe(
      false,
    );

    const entry = await store.insertLedgerEntry({
      id: randomUUID(),
      propertyId,
      accountId,
      kind: "adjustment",
      entryDate: "2026-03-01",
      amountCents: 1_000,
      note: "Charge",
      feeMonth: null,
      reconciliationYearId: null,
    });
    expect(await queries.hasTransactionsOrLedgerEntries(propertyId)).toBe(true);
    expect(await queries.accountHasActivity(propertyId, accountId)).toBe(true);

    const updated = await store.updateLedgerEntry({
      ...entry,
      amountCents: -2_000,
      note: "Credit",
    });
    expect(updated).toMatchObject({ amountCents: -2_000, note: "Credit" });
    expect(await queries.getLedgerEntry(propertyId, entry.id)).toEqual(updated);
    expect(await queries.getLedgerEntry(randomUUID(), entry.id)).toBeNull();

    expect(await store.deleteLedgerEntry(propertyId, entry.id)).toBe(true);
    expect(await queries.accountHasActivity(propertyId, accountId)).toBe(false);
  });

  it("rejects a second decision for the same fee month and an adjustment with no note", async () => {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    propertyIds.push(propertyId);
    await store.insertLedgerEntry({
      id: randomUUID(),
      propertyId,
      accountId,
      kind: "late_fee",
      entryDate: "2026-03-11",
      amountCents: 5_000,
      note: null,
      feeMonth: "2026-03",
      reconciliationYearId: null,
    });

    await expect(
      db.insert(accountLedgerEntries).values({
        propertyId,
        accountId,
        kind: "late_fee_dismissed",
        entryDate: "2026-03-12",
        amountCents: 0,
        feeMonth: "2026-03",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(accountLedgerEntries).values({
        propertyId,
        accountId,
        kind: "adjustment",
        entryDate: "2026-03-12",
        amountCents: 100,
        note: " ",
      }),
    ).rejects.toThrow();
  });
  it("rejects a second true-up for the same year and account", async () => {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    const reconciliationYearId = randomUUID();
    propertyIds.push(propertyId);
    await db
      .insert(reconciliationYears)
      .values({ id: reconciliationYearId, propertyId, year: 2026 });
    const trueUp = {
      propertyId,
      accountId,
      kind: "true_up" as const,
      entryDate: "2027-01-01",
      amountCents: 23_774,
      note: null,
      feeMonth: null,
      reconciliationYearId,
    };
    await store.insertLedgerEntry({ id: randomUUID(), ...trueUp });

    await expect(
      store.insertLedgerEntry({ id: randomUUID(), ...trueUp }),
    ).rejects.toThrow(DuplicateLedgerEntryError);
    await expect(
      store.insertLedgerEntry({
        id: randomUUID(),
        ...trueUp,
        accountId: randomUUID(),
      }),
    ).resolves.toMatchObject({ reconciliationYearId });
  });

  it("maps a second fee decision from the store to a duplicate error", async () => {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    propertyIds.push(propertyId);
    const fee = {
      propertyId,
      accountId,
      kind: "late_fee" as const,
      entryDate: "2026-03-11",
      amountCents: 5_000,
      note: null,
      feeMonth: "2026-03",
      reconciliationYearId: null,
    };
    await store.insertLedgerEntry({ id: randomUUID(), ...fee });

    await expect(
      store.insertLedgerEntry({
        id: randomUUID(),
        ...fee,
        kind: "late_fee_dismissed",
        amountCents: 0,
      }),
    ).rejects.toThrow(DuplicateLedgerEntryError);
  });

  it("rejects a dismissed late fee with an amount and an adjustment of 0", async () => {
    const propertyId = randomUUID();
    const accountId = randomUUID();
    propertyIds.push(propertyId);

    await expect(
      db.insert(accountLedgerEntries).values({
        propertyId,
        accountId,
        kind: "late_fee_dismissed",
        entryDate: "2026-04-11",
        amountCents: 5_000,
        feeMonth: "2026-04",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(accountLedgerEntries).values({
        propertyId,
        accountId,
        kind: "adjustment",
        entryDate: "2026-04-12",
        amountCents: 0,
        note: "Nothing",
      }),
    ).rejects.toThrow();
    expect(await queries.listLedgerEntries(propertyId)).toEqual([]);
  });
});
