import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { Account, AccountRepository } from "@moonship/lease-mgmt";

import type { AccountDeps } from "../accounts";
import {
  assertAccountRules,
  assertAccountVersion,
  getAccountDetail,
  saveAccount,
  toLeaseTerms,
} from "../accounts";
import { notFound, toBadRequest } from "../errors";
import { expectedVersionSchema, leaseInputSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface LeaseRouterDeps extends AccountDeps {
  accountRepository: AccountRepository;
}

export function leaseRouter(deps: LeaseRouterDeps) {
  async function change(
    propertyId: string,
    target: { accountId: string; expectedVersion: number },
    apply: (account: Account) => void,
    options: { checkRules: boolean },
  ) {
    const account = await deps.accountRepository.findById(
      propertyId,
      target.accountId,
    );
    if (!account) throw notFound("Account not found");
    assertAccountVersion(account, target.expectedVersion);
    const storedLeases = account.leases;
    try {
      apply(account);
    } catch (e) {
      if (e instanceof Error && /not found/i.test(e.message)) {
        throw notFound(e.message);
      }
      throw toBadRequest(e, "Lease change failed");
    }
    if (options.checkRules) {
      await assertAccountRules(deps, propertyId, account, storedLeases);
    }
    await saveAccount(deps.accountRepository, account);
    return getAccountDetail(deps, propertyId, account.id);
  }

  return router({
    add: propertyProcedure
      .input(
        z.object({
          accountId: z.string().uuid(),
          expectedVersion: expectedVersionSchema,
          lease: leaseInputSchema,
        }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input,
          (account) =>
            account.addLease({
              id: randomUUID(),
              ...toLeaseTerms(input.lease, null),
            }),
          { checkRules: true },
        ),
      ),

    update: propertyProcedure
      .input(
        z.object({
          accountId: z.string().uuid(),
          expectedVersion: expectedVersionSchema,
          leaseId: z.string().uuid(),
          lease: leaseInputSchema,
        }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input,
          (account) =>
            account.updateLease(
              input.leaseId,
              toLeaseTerms(input.lease, account.findLease(input.leaseId)),
            ),
          { checkRules: true },
        ),
      ),

    remove: propertyProcedure
      .input(
        z.object({
          accountId: z.string().uuid(),
          expectedVersion: expectedVersionSchema,
          leaseId: z.string().uuid(),
        }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input,
          (account) => account.removeLease(input.leaseId),
          { checkRules: true },
        ),
      ),

    setRentStepNotified: propertyProcedure
      .input(
        z.object({
          accountId: z.string().uuid(),
          expectedVersion: expectedVersionSchema,
          leaseId: z.string().uuid(),
          stepId: z.string().uuid(),
          notified: z.boolean(),
        }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input,
          (account) =>
            account.markRentStepNotified(
              input.leaseId,
              input.stepId,
              input.notified ? new Date() : null,
            ),
          { checkRules: false },
        ),
      ),
  });
}
