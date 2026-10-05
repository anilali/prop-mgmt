import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { AccountRepository } from "@moonship/lease-mgmt";
import { Account } from "@moonship/lease-mgmt";

import type { AccountDeps } from "../accounts";
import {
  assertAccountRules,
  getAccountDetail,
  listAccountSummaries,
  toLeaseTerms,
} from "../accounts";
import { badRequest, conflict, notFound, toBadRequest } from "../errors";
import { loadProperty } from "../property-context";
import { centsSchema, leaseInputSchema } from "../schemas";
import { propertyProcedure, router } from "../trpc";

export interface AccountRouterDeps extends AccountDeps {
  accountRepository: AccountRepository;
}

export function accountRouter(deps: AccountRouterDeps) {
  return router({
    list: propertyProcedure.query(async ({ ctx }) => {
      const { today } = await loadProperty(
        deps.propertyQueries,
        ctx.propertyId,
      );
      return {
        today,
        accounts: await listAccountSummaries(deps, ctx.propertyId, today),
      };
    }),

    get: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(({ ctx, input }) =>
        getAccountDetail(deps, ctx.propertyId, input.id),
      ),

    open: propertyProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          unitId: z.string().uuid(),
          openingBalanceCents: centsSchema,
          lease: leaseInputSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const unit = await deps.unitQueries.getById(
          ctx.propertyId,
          input.unitId,
        );
        if (!unit) throw badRequest("Unit not found");
        const tenant = await deps.tenantQueries.getById(
          ctx.propertyId,
          input.tenantId,
        );
        if (tenant?.status !== "active") {
          throw badRequest("Active tenant required");
        }

        let account: Account;
        try {
          account = Account.open(
            {
              id: randomUUID(),
              propertyId: ctx.propertyId,
              tenantId: input.tenantId,
              unitId: input.unitId,
              openingBalanceCents: input.openingBalanceCents,
            },
            { id: randomUUID(), ...toLeaseTerms(input.lease, null) },
          );
        } catch (e) {
          throw toBadRequest(e, "Open failed");
        }
        await assertAccountRules(deps, ctx.propertyId, account, []);
        await deps.accountRepository.save(account);
        return getAccountDetail(deps, ctx.propertyId, account.id);
      }),

    setOpeningBalance: propertyProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          openingBalanceCents: centsSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const account = await deps.accountRepository.findById(
          ctx.propertyId,
          input.id,
        );
        if (!account) throw notFound("Account not found");
        const storedLeases = account.leases;
        try {
          account.setOpeningBalance(input.openingBalanceCents);
        } catch (e) {
          throw toBadRequest(e, "Update failed");
        }
        await assertAccountRules(deps, ctx.propertyId, account, storedLeases);
        await deps.accountRepository.save(account);
        return getAccountDetail(deps, ctx.propertyId, account.id);
      }),

    remove: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const account = await deps.accountQueries.getById(
          ctx.propertyId,
          input.id,
        );
        if (!account) throw notFound("Account not found");
        if (
          await deps.billingQueries.accountHasActivity(ctx.propertyId, input.id)
        ) {
          throw conflict(
            "This account has payments, balance entries, or statements and cannot be deleted",
          );
        }
        await deps.accountRepository.delete(ctx.propertyId, input.id);
        return { ok: true as const };
      }),
  });
}
