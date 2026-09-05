# prop-mgmt

Single-property management platform with dual Next.js portals:

- **operator-portal** — staff / operators (`http://localhost:3000`)
- **tenant-portal** — residents (`http://localhost:3001`)

Monorepo layout follows a layered DDD style: thin apps → portal API packages → pure domain contexts → infrastructure.

## Prerequisites

- Node from [`.nvmrc`](.nvmrc)
- [pnpm](https://pnpm.io) 11+
- [Podman](https://podman.io) (local Postgres + MinIO). On macOS Desktop installs, ensure `/opt/podman/bin` is on your `PATH` (the `pnpm db:up` script already adds it).

## Quick start

```bash
cp .env.example .env
# Fill Google OAuth client IDs/secrets for both portals

pnpm i
pnpm db:up          # Postgres + MinIO (+ bucket init)
pnpm db:migrate
pnpm dev:operator   # or pnpm dev:tenant / pnpm dev
```

Operator dashboard (after Google sign-in + staff/bootstrap):

- `/property` — address, units (sqft, optional address override, utility share graph)
- `/tenants` — operator CRM tenants
- `/leases` — lease terms + PDF upload (one doc per term; MinIO)

MinIO console: `http://localhost:9001` (user/pass from `.env` / compose defaults).

## Scripts

| Script | Purpose |
|---|---|
| `pnpm db:up` / `db:down` | Start/stop Postgres **and** MinIO via Podman Compose |
| `pnpm db:migrate` | Generate + run Drizzle migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm dev:operator` | Operator portal |
| `pnpm dev:tenant` | Tenant portal |
| `pnpm lint` / `typecheck` / `test` | Quality gates |
| `pnpm test:integration` | DB integration tests (needs Postgres up) |

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
Lease PDFs are stored in MinIO (`S3_*` env vars).
