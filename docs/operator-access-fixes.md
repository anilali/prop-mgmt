# Operator access fixes, round 2

This is a work plan for the issues found after the first round of operator access fixes. It is written for agents who have not seen the review that produced it. Read `docs/operator-access.md` for the rules this code follows.

The migration squash from round 1 is still open and is not part of this plan. The user will handle it.

## Tasks

1. One database pool and one API instance for the portal.
2. Fix lint in `@moonship/api-operator`.
3. Remove the empty test setup from the portal.
4. Remove `AccessQueries.list` and `AccessListFilters`.
5. Remove `PlatformAdmin.claim`.
6. Remove the projections comment.
7. Use the `isPlatformAdmin` policy in the portal.

They are small and touch different files, so one pull request is fine. Do them in order, since task 1 changes files that task 7 also touches.

Run tests with `pnpm -r --filter <package> exec vitest run`. Run typecheck and lint with `pnpm turbo run typecheck lint --filter @moonship/operator-portal... --continue`. Do not run dev servers or builds.

## 1. One database pool and one API instance

### Problem

`createDb` in `packages/infrastructure/db/src/client.ts` opens a new `postgres` connection pool on every call. The operator portal calls it in five places:

| Where | How |
|---|---|
| `apps/operator-portal/src/auth/server.ts`, module level | `createDb(env.POSTGRES_URL)` for Better Auth |
| `apps/operator-portal/src/auth/server.ts`, inside the session-create hook | `createOperatorAPI(...)` on every sign-in |
| `apps/operator-portal/src/trpc/init.ts` | `createOperatorAPI(...)` |
| `apps/operator-portal/src/request-access.ts` | `createOperatorAPI(...)` |
| `apps/operator-portal/src/app/api/trpc/[trpc]/route.ts` | `createOperatorAPI(...)` |

Each `createOperatorAPI` call runs `createDb` and builds an S3 client. The call inside the hook runs on every sign-in, and nothing ever closes those pools. So each sign-in leaks a pool, and the portal runs four pools even before anyone signs in.

### Fix

The portal should end up with one pool and one `createOperatorAPI` instance, created once per server process.

**1. Let `createOperatorAPI` accept a database client.** In `packages/api/operator/src/composition.ts`, replace `databaseUrl: string` in `OperatorAPIConfig` with `db: DatabaseClient`. `DatabaseClient` is exported from `@moonship/db`. Remove the `createDb` call inside `createOperatorAPI`. Nothing outside the portal calls `createOperatorAPI`. Check with `rg "createOperatorAPI\("`.

**2. Create `apps/operator-portal/src/server/operator-api.ts`.** It is server-only and holds the single database client and API instance:

```ts
import "server-only";

import type { DatabaseClient } from "@moonship/db";
import { createOperatorAPI } from "@moonship/api-operator/server";
import { createDb } from "@moonship/db";

import { env } from "~/env";

const globalForOperatorApi = globalThis as unknown as {
  operatorDb?: DatabaseClient;
  operatorApi?: ReturnType<typeof createOperatorAPI>;
};

export const db = globalForOperatorApi.operatorDb ?? createDb(env.POSTGRES_URL);

export const operatorApi =
  globalForOperatorApi.operatorApi ??
  createOperatorAPI({
    db,
    s3: {
      endpoint: env.AWS_ENDPOINT_URL_S3,
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      bucket: env.S3_BUCKET,
      forcePathStyle: true,
    },
  });

if (env.NODE_ENV !== "production") {
  globalForOperatorApi.operatorDb = db;
  globalForOperatorApi.operatorApi = operatorApi;
}
```

The `globalThis` cache is there because Next.js reloads modules in development, and each reload would otherwise open another pool. In production the module loads once, so the cache is not needed.

This module must not import `~/auth/server`, `~/request-access`, or anything under `~/trpc`. Those modules import it, and a cycle would break the singleton.

**3. Point every caller at it:**

- `auth/server.ts` uses `db` from `~/server/operator-api` for the Better Auth `drizzleAdapter` and for the user lookup in the hook. Delete its own `createDb` call. The hook calls `claimAccessOnSignIn(operatorApi.claimAccessDeps, ...)`. Delete the `createOperatorAPI` call inside the hook.
- `trpc/init.ts` becomes `export const { appRouter, createTRPCContext } = operatorApi;`.
- `request-access.ts` calls `operatorApi.loadRequestAccess`. Delete its `createOperatorAPI` call.
- `app/api/trpc/[trpc]/route.ts` calls `operatorApi.loadRequestAccess`. Delete its `createOperatorAPI` call.

### Check

- `rg "createOperatorAPI\(|createDb\(" apps/operator-portal/src` finds exactly one line of each, both in `server/operator-api.ts`.
- `auth/server.ts` has no `createDb` or `createOperatorAPI` call.
- Typecheck passes.

The tenant portal has the same pattern in `apps/tenant-portal/src/auth/server.ts`. Leave it alone. It is out of scope.

## 2. Fix lint in `@moonship/api-operator`

`pnpm turbo run lint --filter @moonship/api-operator` reports 26 errors. Fix each one in the code. Do not add `eslint-disable` lines.

**`src/routers/access.ts` line 71, `prefer-optional-chain`.** Change `if (existing && existing.status === "active")` to `if (existing?.status === "active")`.

**`src/routers/access.test.ts`, 15 cases of `no-unnecessary-condition`.** These are at lines 129 to 131, 145 to 147, 187 to 190, 238, 239, 246, 247, and 325. The `grant` procedure now returns a non-null membership, so `created?.email` and similar should be `created.email`. Remove the `?.` on each reported line.

**`src/routers/property.test.ts`.**

- Lines 136 and 152, `no-unnecessary-condition`. Remove the `?.`, since `getForPlatform` and `register` return non-null values.
- Lines 72 and 73, `require-await`. The fake `propertyRepository` methods are `async` with no `await`. Make them plain functions that return promises: `findById: () => Promise.resolve(null)` and `save: (property: Property) => { names.set(property.id, property.name); return Promise.resolve(); }`.

**`src/test-access-store.ts`, `require-await`.** This covers `findByPropertyId` at line 16, `findByAuthUserId` at line 53, `claimByEmail` at line 65, the private `list` at line 102, and `InMemoryPropertyQueries.getById` at line 145. Apply the same change. Drop `async` and return `Promise.resolve(value)`. The private `list` helper has no reason to be async at all. Make it synchronous and wrap its result in `Promise.resolve` at the public methods that return it.

**`src/access.test.ts` line 136, `no-empty-function`.** `vi.spyOn(console, "warn").mockImplementation(() => {})` has an empty arrow. Use `mockImplementation(() => undefined)`.

### Check

`pnpm turbo run lint --filter @moonship/api-operator` passes with no errors. Tests in `@moonship/api-operator` still pass.

Lint also fails in `@moonship/ui` (`badge.tsx`), `@moonship/db` (`AddressJson` in `schemas/property/schema.ts`), and `@moonship/operator-portal` (`unit-dialog.tsx`). Those errors are in code this work did not touch. Leave them.

## 3. Remove the empty test setup from the portal

The portal's only test moved to `packages/api/operator/src/operator-context.test.ts`. `apps/operator-portal/package.json` still has a `test` script and a `vitest` dev dependency. With no test files, `vitest run` exits with code 1, so `pnpm test` fails across the repo.

In `apps/operator-portal/package.json`:

- Remove `"test": "vitest run"` from `scripts`.
- Remove `"vitest": "catalog:"` from `devDependencies`.

Then run `pnpm install` so `pnpm-lock.yaml` updates. Do not edit the lockfile by hand.

### Check

`pnpm turbo run test --filter @moonship/operator-portal...` passes.

## 4. Remove `AccessQueries.list` and `AccessListFilters`

`getMemberships(propertyId)` is the only caller of `list`, and it calls it internally. Nothing outside the implementations uses `list` or `AccessListFilters`.

- `packages/contexts/access/src/queries/access-queries.ts`: remove `AccessListFilters` and `list` from `AccessQueries`.
- `packages/contexts/access/src/index.ts`: remove the `AccessListFilters` export.
- `packages/infrastructure/db/src/queries/access/access-queries.ts`: write `getMemberships` as a direct query on `eq(accessMemberships.propertyId, propertyId)`. Remove `list` and the `AccessListFilters` import.
- `packages/api/operator/src/test-access-store.ts`: remove the public `list` and the `AccessListFilters` import. Keep a private helper if `getMemberships` needs one, taking just `propertyId`.

### Check

`rg "AccessListFilters|accessQueries\.list|queries\.list\(" packages apps --glob '!**/node_modules/**'` finds nothing.

## 5. Remove `PlatformAdmin.claim`

Claiming is now a conditional update in `PlatformAdminRepository.claimByEmail`, so the entity method is dead code. Only a test in `packages/contexts/access/src/policies/access-policies.test.ts` calls it.

- `packages/contexts/access/src/entities/platform-admin.ts`: delete `claim`.
- `access-policies.test.ts`: delete the `describe("PlatformAdmin.claim", ...)` block. The rule "a claimed `authUserId` never changes" is already covered by the claim tests in `packages/api/operator/src/access.test.ts`. Check that one of them asserts that a row claimed by another `authUserId` is left alone. If none does, add that test there.

### Check

`rg "\.claim\(" packages --glob '!**/node_modules/**'` finds nothing.

## 6. Remove the projections comment

`packages/infrastructure/projections/src/index.ts` opens with a comment block that this work rewrote. Delete the whole block. The exported names `ProjectionName` and `OperatorMembershipDirectoryRow` already say what the file holds.

## 7. Use the `isPlatformAdmin` policy in the portal

Two places check for platform admin with `access.state.platformAdmins.length > 0` instead of calling the policy:

- `apps/operator-portal/src/app/(authenticated)/layout.tsx`, the `isPlatformAdmin` prop passed to `Sidebar`.
- `apps/operator-portal/src/app/_actions/operator-context.ts`, the `isPlatformAdmin` passed to `decideOperatorContextSwitch`.

Add an `isPlatformAdmin: boolean` field to `RequestAccess` in `packages/api/operator/src/operator-context.ts`. `loadRequestAccess` already computes it as `admin`. Return it. Both portal call sites read `access.isPlatformAdmin`. The decision then stays in the Access policy, and the portal never reads `state` directly.

Update tests that build a `RequestAccess` by hand, if any, to include the field.

### Check

`rg "platformAdmins\.length" apps packages --glob '!**/node_modules/**'` finds nothing.

## Done when

- `pnpm -r --filter @moonship/access --filter @moonship/api-operator --filter @moonship/tenant-mgmt --filter @moonship/lease-mgmt --filter @moonship/property exec vitest run` passes.
- `pnpm turbo run typecheck --filter @moonship/operator-portal...` passes.
- `pnpm turbo run lint --filter @moonship/api-operator --filter @moonship/access` passes.
- `pnpm turbo run test --filter @moonship/operator-portal...` passes.
- Every check listed under the tasks above passes.
- In the running app, sign in and out several times, then run `select count(*) from pg_stat_activity where datname = current_database();` in Postgres. The count should stay flat across sign-ins. The user checks this by hand.
