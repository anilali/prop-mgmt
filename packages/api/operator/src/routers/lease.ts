import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { Account, AccountRepository } from "@moonship/lease-mgmt";

import type { AccountDeps } from "../accounts";
import {
  assertAccountRules,
  getAccountDetail,
  toLeaseTerms,
} from "../accounts";
import { notFound, toBadRequest } from "../errors";
import { leaseInputSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface LeaseRouterDeps extends AccountDeps {
  accountRepository: AccountRepository;
}

export function leaseRouter(deps: LeaseRouterDeps) {
  async function change(
    propertyId: string,
    accountId: string,
    apply: (account: Account) => void,
    options: { checkRules: boolean },
  ) {
    const account = await deps.accountRepository.findById(
      propertyId,
      accountId,
    );
    if (!account) throw notFound("Account not found");
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
    await deps.accountRepository.save(account);
    return getAccountDetail(deps, propertyId, account.id);
  }

  return router({
    add: propertyProcedure
      .input(
        z.object({ accountId: z.string().uuid(), lease: leaseInputSchema }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input.accountId,
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
          leaseId: z.string().uuid(),
          lease: leaseInputSchema,
        }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input.accountId,
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
          leaseId: z.string().uuid(),
        }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input.accountId,
          (account) => account.removeLease(input.leaseId),
          { checkRules: true },
        ),
      ),

    setRentStepNotified: propertyProcedure
      .input(
        z.object({
          accountId: z.string().uuid(),
          leaseId: z.string().uuid(),
          stepId: z.string().uuid(),
          notified: z.boolean(),
        }),
      )
      .mutation(({ ctx, input }) =>
        change(
          ctx.propertyId,
          input.accountId,
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
