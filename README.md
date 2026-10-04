# prop-mgmt

Single-property management platform with dual Next.js portals:

- **operator-portal** - staff / operators (`http://localhost:3000`)
- **tenant-portal** - residents (`http://localhost:3001`)

Monorepo layout follows a layered DDD style: thin apps → portal API packages → pure domain contexts → infrastructure.

## Prerequisites

- Node from [`.nvmrc`](.nvmrc)
- [pnpm](https://pnpm.io) 11+
- [Vercel CLI](https://vercel.com/docs/cli) linked to the `prop-mgmt` project (Neon Postgres via the Vercel Integration)
- [Neon CLI](https://neon.com/docs/reference/cli) authenticated (Object Storage via `neon.ts`)

## Quick start

```bash
cp .env.example .env
# Fill Google OAuth client IDs/secrets for both portals
vercel env pull .env.local --environment=development
neon env pull --file .env.local -s object-storage

pnpm i
pnpm db:migrate
pnpm dev:operator   # or pnpm dev:tenant / pnpm dev
```

Operator dashboard (Google sign-in, then a `property.staff_members` row for that auth user id):

- `/property` - address, units (sqft, optional address override, utility share graph)
- `/tenants` - operator CRM tenants
- `/leases` - lease terms + PDF upload (one doc per term; Neon Object Storage)

## Scripts

| Script | Purpose |
|---|---|
| `pnpm db:migrate` | Generate + run Drizzle migrations on Neon |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm dev:operator` | Operator portal |
| `pnpm dev:tenant` | Tenant portal |
| `pnpm lint` / `typecheck` / `test` | Quality gates |
| `pnpm test:integration` | DB integration tests (needs Neon `POSTGRES_URL`) |

## Package map

```text
apps/operator-portal          @moonship/operator-portal
apps/tenant-portal            @moonship/tenant-portal
packages/api/operator         @moonship/api-operator
packages/api/tenant           @moonship/api-tenant
packages/contexts/*           domain packages (pure TS)
packages/infrastructure/db    @moonship/db
packages/infrastructure/events
packages/infrastructure/blob-storage
packages/infrastructure/projections
packages/shared
packages/ui
```

Auth tables are **separate per portal** (`auth_operator` / `auth_tenant` schemas). Both portals use Google social sign-in only.
Postgres and lease PDFs both live on Neon (DB + Object Storage bucket `leases` in `neon.ts`).
