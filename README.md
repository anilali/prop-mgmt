# prop-mgmt

Rent tracking and year-end reconciliation for a small commercial property, with two Next.js portals:

- **operator-portal** - the owner (`http://localhost:3000`)
- **tenant-portal** - tenants, sign-in only for now (`http://localhost:3001`)

What v1 does is in [`docs/v1/prd.md`](docs/v1/prd.md). How it's built is in [`docs/v1/eng-spec.md`](docs/v1/eng-spec.md).

The monorepo is layered: thin apps, then portal API packages, then pure domain packages, then infrastructure.

## Prerequisites

- Node from [`.nvmrc`](.nvmrc)
- [pnpm](https://pnpm.io) 11+
- A Neon project with a dev branch for Postgres
- [Neon CLI](https://neon.com/docs/reference/cli), signed in, for the object storage keys (bucket defined in `neon.ts`)

## Environment

All settings live in one file, `.env`, at the repo root. Every package's `with-env` script loads only that file.

```bash
cp .env.example .env
```

Then fill in:

- `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`: the dev branch's connection strings from the Neon console. Don't use `vercel env pull`; it writes the main branch's values.
- The object storage keys (`AWS_*`, `S3_BUCKET`). Run `neon env pull --file .env.storage.local -s object-storage`, copy the values into `.env`, and delete `.env.storage.local`. Its name matches `.gitignore`, so it can't be committed by mistake. Statement PDFs are saved here when a year is finalized.
- Google OAuth client IDs and secrets, and an auth secret, for each portal.

## Quick start

```bash
pnpm i
pnpm db:migrate
pnpm dev:operator   # or pnpm dev:tenant / pnpm dev
```

The first time, in the operator portal:

1. Add a row for your email to `access.platform_admins` by hand in SQL. There's no screen for this.
2. Sign in with Google. Signing in links the row to your account.
3. Register the property in platform mode, then grant yourself access to it.
4. Switch to the property and open Setup: set the tracking start date and the letter details, then add units, pools, tenants, and accounts with their leases.

## Operator portal pages

| Page | What it's for |
|---|---|
| `/home` | Who's behind, late fees to decide, transactions to sort, rent changes, insurance, leases ending |
| `/rent`, `/rent/[accountId]` | Balances and status per account; history, adjustments, late fees |
| `/transactions`, `/transactions/import` | Sort bank rows and cash expenses; import the bank CSV |
| `/reconciliation`, `/reconciliation/[year]` | Year-end checklist, pool costs, statement previews, finalize, downloads |
| `/tenants` | Tenant contact and mailing details |
| `/leases`, `/leases/[accountId]` | Accounts and their leases: rent steps, estimates, late fee, insurance date |
| `/setup` | Property, letter details, units, cost pools, categories |
| `/access` | Who can use the property (admins only) |

## Scripts

| Script | Purpose |
|---|---|
| `pnpm db:migrate` | Generate and apply Drizzle migrations. To review the SQL first, run `pnpm -F @moonship/db db:migrate:generate`, read it, then `pnpm -F @moonship/db db:migrate:execute`. |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm dev:operator` | Operator portal |
| `pnpm dev:tenant` | Tenant portal |
| `pnpm lint` / `typecheck` / `test` | Quality gates |
| `pnpm test:integration` | Database tests for `@moonship/db` and `@moonship/api-operator`. They write and delete rows, so run them only against a dev branch. |

## Package map

```text
apps/operator-portal                  @moonship/operator-portal
apps/tenant-portal                    @moonship/tenant-portal
packages/api/operator                 @moonship/api-operator
packages/api/tenant                   @moonship/api-tenant
packages/contexts/access              operators, platform admins, memberships
packages/contexts/property            property, units
packages/contexts/tenant-mgmt         tenants
packages/contexts/lease-mgmt          accounts and leases
packages/contexts/billing             pools, categories, bank import, balances, late fees, reconciliation
packages/infrastructure/db            @moonship/db (schemas, migrations, Postgres stores)
packages/infrastructure/statement-pdf @moonship/statement-pdf (letter and statement PDFs)
packages/infrastructure/blob-storage  object storage for PDFs
packages/infrastructure/events
packages/infrastructure/projections
packages/shared                       money and date helpers
packages/ui                           shadcn/ui components
```

Auth tables are separate per portal (`auth_operator` and `auth_tenant` schemas). Both portals use Google sign-in only.
