# 01. Navigation and property setup

Depends on: nothing. Required by: every other PRD.

## Summary

Replace the operator sidebar with one organized around leasing and finance, add a Settings area, and add the configuration the finance features need: unit areas, categories, and cost pools. Remove the residential fields units carry today (bedrooms, bathrooms, utility sharing), since the platform only manages commercial properties. Replace the hand-set unit status with occupancy computed from leases. Add a dashboard that lists work to do. Later PRDs add its cards.

## Problem

- The sidebar has placeholder items that point at the wrong pages. "Tasks" opens leases, "Applicants" opens tenants, "Outgoing" opens leases again, and "Settings" opens the property page.
- Units live on `/property`, mixed with property details. Shared costs are split by unit area, so area has to be accurate and sit next to the settings that depend on it.
- Units have residential fields: bedrooms, bathrooms, and a per-unit utility sharing setting. None of them apply to commercial space, and utility sharing overlaps with cost pools.
- Unit status (`vacant`, `occupied`, `offline`) is set by hand, so it can disagree with the leases.
- There is nowhere to say what kinds of money a property tracks or how shared costs are split between units. Every later PRD needs that.

## Goals

- An operator can find every screen from the sidebar in one click.
- An admin can configure a property for NNN billing without help: units, categories, cost pools.
- Changing a pool's units or rule shows each unit's share before saving.
- Later PRDs can add a sidebar item or dashboard card by adding one config entry.

## Non-goals

- Bank account settings. Covered in 05, which adds a tab to Settings.
- Categorization rules. Covered in 05, on the Transactions screen.
- Charts or financial summaries on the dashboard.
- Changing platform mode beyond the shared sidebar component.

## Users and permissions

| Action | Staff | Admin |
|---|---|---|
| See the sidebar and dashboard | yes | yes |
| Open Settings | no | yes |
| Edit property details and units | no | yes |
| Edit categories and cost pools | no | yes |

Staff who open `/settings` directly are redirected to `/dashboard`. The API rejects their writes with `FORBIDDEN`.

## User stories

- As an operator, I see the screens grouped by what I'm doing, so I can find rent roll and transactions without guessing.
- As an admin, I enter each unit's area once, and every share calculation reads it from there.
- As an admin, I set which units share water and how the cost is divided, and see each unit's share as I change it.
- As an admin, I add a category for a new kind of expense, and archive one I no longer use without losing history.

## Sidebar

### Layout

```text
Property mode                      Route
-------------                      -----
Dashboard                          /dashboard

LEASING
  Tenants                          /tenants
  Leases                           /leases
  Documents                        /documents         (added by 03)

FINANCE
  Rent roll                        /rent-roll         (added by 04)
  Transactions          (count)    /transactions      (added by 05)
  Reconciliation                   /reconciliation    (added by 06)

----
  Access            (admin only)   /access
  Settings          (admin only)   /settings

Platform mode
-------------
  Properties                       /platform/properties
```

Group headers are small muted labels, not collapsible. Nine items fit on a laptop screen without collapsing. A group with no items yet (FINANCE before 04 ships) is hidden.

The assistant from 07 has no sidebar item. It opens from an "Ask" button in the header on every page.

### Behavior

- Nav items come from one array in `apps/operator-portal/src/app/_components/nav-config.ts`:

```ts
interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "main" | "leasing" | "finance" | "footer";
  requires: "operate" | "manageAccess";
  mode: "property" | "platform";
  activePaths: string[];
  badge?: "transactionsNeedingReview";
}
```

- `SidebarNav` filters by mode and role and renders groups in a fixed order. It replaces the current hard-coded `mainItems`, `secondaryItems`, and the "fall back to Events when nothing matches" selection logic. When no item matches the path, none is selected.
- An item is active when the path starts with any of its `activePaths`. `/leases/123` keeps Leases active.
- Badges come from one lightweight query, `nav.badges`, fetched with the sidebar and refreshed on navigation. It returns counts keyed by badge name. A zero hides the badge.
- Hiding an item is not a permission check. Pages check access on the server.

### Route changes

- `/dashboard` is new and becomes the landing page in property mode. `/` redirects there instead of `/property`.
- `/property` redirects to `/settings`. Bookmarks keep working.
- `/events` and its placeholder page are removed. The route returns not found.
- Unit management moves to `/settings/units`.

## Settings

`/settings` is a layout with a tab bar. Each tab is its own route so it can be linked.

| Route | Tab | Added by |
|---|---|---|
| `/settings` | Property | 01 |
| `/settings/units` | Units | 01 |
| `/settings/categories` | Categories | 01 |
| `/settings/cost-pools` | Cost pools | 01 |
| `/settings/bank-accounts` | Bank accounts | 05 |

Categorization rules are not in Settings. Staff maintain them while categorizing, so they live at `/transactions/rules` (05).

### Property tab

Name and address. Same fields as today's property form.

### Units tab

A table with label, sqft, address, and occupancy, and an "Add unit" action that opens a side sheet.

- `sqft` is required and must be a whole number above zero.
- The side sheet lists every `selected` cost pool as a checkbox, such as each shared water meter, so the admin decides which ones the unit joins while adding or editing it. The unit joins `all` pools automatically.
- Total rentable area shows at the bottom of the table.
- Occupancy is computed from leases, not stored on the unit. It shows "Occupied" with the tenant's name when the unit has an active lease, and "Vacant" when it has none. A unit being renovated or used by the owner is Vacant, and the owner pays its share of every pool. A month-to-month lease (02) counts as occupying the unit until an operator ends it with the move-out date. That status belongs to the lease, so the Units tab doesn't show it. Property doesn't know about leases, so the API layer joins the unit list with active leases from LeaseMgmt.
- Editing a unit's sqft saves directly. Monthly estimates on leases don't change. The new area is used by the cost pools tab and by reconciliations started after the change (06).
- Units are never deleted, so their leases, charges, and reconciliation history keep pointing at a real record.
- An admin archives a unit when the space no longer exists as its own unit, for example after combining two suites or splitting one. An archived unit leaves every pool, and it's hidden from the table, lease pickers, and pool pickers. A "Show archived" toggle on the table lists archived units, and their past leases still show them.
- A unit with an active lease can't be archived, including a month-to-month one. The operator ends the lease with the move-out date first (02).
- Archiving asks for confirmation and lists the cost pools the unit will leave.
- Archiving can't be undone. To bring a space back, the admin creates a new unit.

Removed from units:

- `bedrooms` and `bathrooms`. Dropped from the form, API, aggregate, and table.
- `utilities` and the utility sharing rules in the `Unit` aggregate. Shared utilities like water are cost pools now.
- `status` and `UnitStatusChanged`. Occupancy comes from leases.

The migration drops these columns and adds `check (sqft > 0)`. There are no units in the database today, so no data needs converting.

### Categories tab

A table of the property's categories with name, kind, status, and usage count (transactions and pools that reference it).

Kinds:

| Kind | Meaning | Feeds reconciliation | In totals |
|---|---|---|---|
| `recoverable` | Shared cost tenants pay a share of | yes | yes |
| `property_expense` | Cost the owner absorbs | no | yes |
| `income` | Money in | no | yes |
| `transfer` | Money between the property's own accounts | no | no |
| `excluded` | Left out of property totals: personal items, security deposits | no | no |

Every property gets these defaults. A property gets them when a platform admin registers it: `RegisterProperty` calls a category seeding service in the same transaction. There are no existing properties to migrate.

| Category | Kind |
|---|---|
| CAM | recoverable |
| Real Estate Tax | recoverable |
| Insurance | recoverable |
| Water | recoverable |
| Repairs | property_expense |
| Utilities (owner paid) | property_expense |
| Tenant Payment | income |
| Other Income | income |
| Transfer | transfer |
| Security Deposit | excluded |
| Not property business | excluded |

Rules:

- Names are unique per property, compared case-insensitively.
- A category's kind is set when it's created and never changes. To fix a wrong kind, the admin archives the category and creates a new one.
- `Tenant Payment` and `Transfer` are system categories. They can be renamed but not archived, because deposit matching (05) and transfer detection (05) depend on them.
- Categories are never deleted. Archiving hides a category from pickers and keeps it on existing records. Archiving can't be undone. Archiving a recoverable category is blocked while any lease has an active recovery on its pool.
- Creating a `recoverable` category creates its cost pool in the same transaction.
- Each recoverable category has exactly one pool. When a property has two shared meters for the same utility, each split among a different group of units, the admin creates one category per meter ("Water, meter A", "Water, meter B") and categorizes each bill to its meter. Units with their own meter stay out of the pool and pay the utility company directly.

### Cost pools tab

One card per recoverable category. Each card has:

- **Membership:**
  - `all`: every unit on the property that isn't archived. New units join automatically and archived units leave. For building-wide costs like CAM.
  - `selected`: units the admin picks from a multi-select of units that aren't archived. For a cost shared by some units, like a shared water meter.
- **Share table.** Each unit's share is its sqft divided by the total sqft of the pool's units. Updates as the admin edits, before saving:

```text
Water                        Membership: selected   Total: 4,350 sqft
Unit        Sqft    Share
4704        2,910   66.90%
4708 #101     850   19.54%
4708 #102     590   13.56%
```

A unit in the pool still counts toward the total when it has no lease, or when its lease has no recovery on the pool, for example a gross lease. The owner pays that unit's share (06).

Defaults:

| Pool | Membership |
|---|---|
| CAM, Real Estate Tax, Insurance | `all` |
| Water | `selected`, no units |
| Any pool an admin creates later | `selected`, no units |

Water starts empty because only units on a shared meter belong in it, and the admin has to pick them.

Pools are never deleted directly. Archiving the category archives its pool.

Shares are displayed to two decimals. They are never stored; 06 computes them at calculation time.

## Dashboard

`/dashboard` shows work that needs attention. It is a list of cards, each with a count, a one-line description, and a link to the screen that resolves it. Cards with nothing to show are hidden. When all are hidden, the page says "Nothing needs attention" with the date.

The dashboard covers the current property only. An operator with several properties switches property to see each one.

Each card is a provider registered in one list:

```ts
interface DashboardProvider {
  id: string;
  audience: "all" | "admin";
  order: number;
  load(ctx: PropertyContext): Promise<{ count: number; href: string; label: string } | null>;
}
```

01 ships the dashboard with no cards, so it shows "Nothing needs attention" until later PRDs add them. `dashboard.cards` skips providers the operator's role can't see, runs the rest in parallel, and sorts by `order`. A provider that throws is logged and left out, so one broken card doesn't break the page. Staff land on the dashboard too, since most cards from 04 and 05 are staff work. Later PRDs add providers:

| Card | Added by |
|---|---|
| Leases ending in 90 days | 02 |
| Month-to-month leases (active past their end date) | 02 |
| Extension option deadlines in 90 days | 02 |
| Renewals missing a signed document | 02 |
| Plans waiting for an admin (admins only) | 07 |
| Amendments uploaded but lease terms not updated | 02, 03 |
| Insurance certificates missing or expiring in 60 days | 03 |
| This month's charges not posted | 04 |
| Leases with a balance older than 30 days | 04 |
| Leases with past months not charged | 04 |
| Transactions needing review | 05 |
| Last year not reconciled | 06 |

## Domain model

All in the Property context.

### Property (aggregate)

Unchanged. `RegisterProperty` in the API layer also seeds default categories and their cost pools in the same transaction.

### Unit (aggregate, changed)

- New field `archivedAt`.
- New invariant: `sqft > 0` on create and on every update.
- Archived units reject updates.
- Removed: `bedrooms`, `bathrooms`, `utilities`, the utility sharing validation, `status`, `changeStatus`, and `UnitStatusChanged`.
- No delete command.

Command `ArchiveUnit`. Event `UnitArchived`. Before archiving, the application service checks with LeaseMgmt that the unit has no active lease. It removes the unit from its `selected` pools in the same transaction, and each one records a `CostPoolConfigured` event. `all` pools need no change.

Creating or updating a unit with pool choices updates each `selected` pool in the same transaction, and each changed pool records a `CostPoolConfigured` event.

### Category (aggregate, new)

Fields: `id`, `propertyId`, `name`, `kind`, `system: boolean`, `archivedAt`.

| Command | Rules | Event |
|---|---|---|
| `CreateCategory(name, kind)` | Unique name. If `recoverable`, the service also creates its pool. | `CategoryCreated` |
| `RenameCategory(name)` | Unique name. | `CategoryRenamed` |
| `ArchiveCategory()` | Not system. Not on an active recovery. | `CategoryArchived` |

### CostPool (aggregate, new)

Fields: `id`, `propertyId`, `categoryId`, `membership`, `unitIds`. `unitIds` is used only when membership is `selected`. For `all`, the pool's units are read from the property's units that aren't archived.

| Command | Rules | Event |
|---|---|---|
| `ConfigureCostPool(membership, unitIds)` | Units belong to the property and aren't archived. `unitIds` is empty for `all`. | `CostPoolConfigured` |

A pool may have no units, for example Water before the admin picks its units, or any pool on a property with no units yet. An empty pool shows a warning on its card. No lease can add a recovery on it (02 requires the lease's unit to be in the pool), and 04 blocks estimates for it.

`CostPoolConfigured` carries the before and after membership and unit lists, for audit.

## API

New and changed procedures in `packages/api/operator`.

| Procedure | Kind | Access | Notes |
|---|---|---|---|
| `nav.badges` | query | operate | Counts for sidebar badges |
| `dashboard.cards` | query | operate | Runs registered providers, filters by role |
| `unit.create`, `unit.update` | mutation | admin | `sqft` required, above zero. Input includes `selectedPoolIds`. No bedrooms, bathrooms, or utilities |
| `unit.list` | query | operate | Includes occupancy computed from active leases. Input `{ includeArchived? }` |
| `unit.archive` | mutation | admin | Archive is rejected while the unit has an active lease. There is no `unit.delete` |
| `category.list` | query | operate | Staff need it for pickers |
| `category.create`, `category.rename`, `category.archive` | mutation | admin | |
| `costPool.list` | query | operate | Includes computed shares |
| `costPool.previewShares` | query | admin | Input is an unsaved config. Returns the share table |
| `costPool.configure` | mutation | admin | |

Unit writes move from `propertyProcedure` to `propertyAdminProcedure`.

## Data model

```text
property.units
  + archived_at       timestamp
  - bedrooms, bathrooms, utilities, status
  + check (sqft > 0)

property.categories
  id                  uuid pk
  property_id         uuid not null references properties on delete cascade
  name                varchar(80) not null
  kind                varchar(32) not null
  system              boolean not null default false
  archived_at         timestamp
  created_at, updated_at
  unique (property_id, lower(name))

property.cost_pools
  id                  uuid pk
  property_id         uuid not null references properties on delete cascade
  category_id         uuid not null references categories
  membership          varchar(16) not null
  created_at, updated_at
  unique (category_id)

property.cost_pool_units          -- rows only for selected pools
  pool_id             uuid references cost_pools on delete cascade
  unit_id             uuid references units
  primary key (pool_id, unit_id)
```

## Edge cases

- **A unit in a pool is archived.** The admin confirms after seeing the pools the unit will leave. The unit leaves every pool, and `CostPoolConfigured` events keep the record for its `selected` pools. Reconciliations use their own year pool settings (06), so archiving a unit today doesn't change a year already started or finalized.
- **A unit with an active lease is archived.** Rejected, including when the lease is month to month. The operator ends the lease with the move-out date first (02).
- **Two suites are combined.** The admin ends their leases if needed, archives both units, creates the combined unit with its new area. It joins `all` pools automatically, and the admin picks its meter pools in the same form.
- **A unit created by mistake.** It can't be deleted. The admin archives it. If it was never in a lease, it only shows under "Show archived".
- **A month-to-month tenant has moved out but the lease isn't ended.** The unit still shows "Occupied" and 04 keeps charging. The month-to-month dashboard card (02) is the prompt to end the lease.
- **Two shared water meters at one property.** The admin creates a second recoverable category for the second meter. Each gets its own pool and its own participating units.
- **A unit pays no share of a pool, like a gross lease.** It stays in the pool, and its lease has no recovery on it. The owner pays its share.
- **Every unit in a `selected` pool is archived.** The pool card shows an error state and 04 blocks estimates for that pool in the next charge run.
- **Property has no units.** The cost pools tab shows an empty state linking to units.
- **A newly registered property.** It already has default categories and four cost pools. Each unit added joins CAM, Real Estate Tax, and Insurance automatically, and the unit form asks about Water.
- **A provider fails.** The card is left out and the error is logged. The rest of the dashboard loads.
- **A staff member's role is changed to admin while signed in.** Settings appears on the next navigation, since role is read on every request.

## Acceptance criteria

1. The sidebar matches the layout above in property mode, with groups hidden when empty, and no item points at a route it isn't named for.
2. `/property` redirects to `/settings`, `/` lands on `/dashboard` in property mode, and `/events` returns not found.
3. Staff can't see Settings in the sidebar, are redirected from `/settings`, and get `FORBIDDEN` from admin procedures.
4. Creating or editing a unit without an area above zero is rejected. Unit forms and the API have no bedrooms, bathrooms, utilities, or status fields.
5. Registering a property creates the default categories and four cost pools: CAM, Real Estate Tax, and Insurance with `all` membership, and Water with `selected` membership and no units.
6. Editing a pool's membership or units updates the share table before saving, and shares sum to 100%.
7. A new unit joins every `all` pool automatically, and its form lets the admin choose its `selected` pools.
8. Archiving a unit requires confirmation and lists the pools it leaves.
9. Categories can't be deleted, and a category's kind can't be changed. Archiving hides it from pickers but not from existing records.
10. Adding a sidebar item or dashboard card in a later PRD requires one config entry and no change to `SidebarNav` or the dashboard page.
11. The Units tab shows Occupied or Vacant for each unit, computed from leases.
12. Units can't be deleted through the UI or the API. Archiving is rejected while the unit has an active lease, and an archived unit drops out of pickers and pools but still shows on its past leases.

## Open questions

1. Is "Not property business" the right default name for the excluded kind? "Personal" is too narrow, since security deposits and another business's spending also land there. "Not for this property" is an alternative.
