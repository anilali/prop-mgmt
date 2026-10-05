# 01. Navigation and property setup

Depends on: nothing. Required by: every other PRD.

## Summary

Replace the operator sidebar with one organized around leasing and finance, add a Settings area, and add the configuration the finance features need: property addresses, unit areas, categories, and cost pools. Remove the residential fields units carry today (bedrooms, bathrooms, utility sharing), since the platform only manages commercial properties. Replace the hand-set unit status with occupancy computed from leases. Add a dashboard that lists work to do. Later PRDs add its cards.

## Problem

- The sidebar has placeholder items that point at the wrong pages. "Tasks" opens leases, "Applicants" opens tenants, "Outgoing" opens leases again, and "Settings" opens the property page.
- Units live on the property page, mixed with property details. Shared costs are split by unit area, so area has to be accurate and sit next to the settings that depend on it.
- A property has one address, and each unit can override it with a typed-in address. The city can assign one building several street addresses, and each unit sits at one of them. Typing addresses by hand lets the same address be spelled several ways.
- Units have residential fields: bedrooms, bathrooms, and a per-unit utility sharing setting. None of them apply to commercial space, and utility sharing overlaps with cost pools.
- Unit status (vacant, occupied, offline) is set by hand, so it can disagree with the leases.
- There is nowhere to say what kinds of money a property tracks or how shared costs are split between units. Every later PRD needs that.

## Goals

- An operator can reach every section from the sidebar in one click.
- An admin can configure a property for NNN billing without help: addresses, units, categories, cost pools.
- Changing a pool's units or rule shows each unit's share before saving.

## Non-goals

- Bank account settings. Covered in 05, which adds a tab to Settings.
- Categorization rules. Covered in 05, on the Transactions screen.
- Charts or financial summaries on the dashboard.
- Platform mode changes, other than using the new sidebar.
- Address autocomplete.

## Users and permissions

Staff are every active member of the property. Admins are property admins and platform admins.

| Action | Staff | Admin |
|---|---|---|
| See the sidebar and dashboard | yes | yes |
| Open Settings | no | yes |
| Edit property details, addresses, and units | no | yes |
| Edit categories and cost pools | no | yes |

Staff who open Settings directly, for example from a bookmark, are sent to the dashboard. Their changes are rejected.

## User stories

- As an operator, I see the screens grouped by what I'm doing, so I can find rent roll and transactions without guessing.
- As an admin, I enter the building's city addresses once, and each unit picks its address from that list.
- As an admin, I enter each unit's area with the month it takes effect, and every share calculation reads it from there.
- As an admin, I set which units share water and how the cost is divided, and see each unit's share as I change it.
- As an admin, I add a category for a new kind of expense, and archive one I no longer use without losing history.

## Sidebar

### Layout

```text
Property mode
-------------
Dashboard

LEASING
  Tenants
  Leases
  Documents                  (added by 03)

FINANCE
  Rent roll                  (added by 04)
  Transactions    (count)    (added by 05)
  Reconciliation             (added by 06)

----
  Access          (admin only)
  Settings        (admin only)

Platform mode
-------------
  Properties
```

Group headers are small muted labels, not collapsible. Nine items fit on a laptop screen without collapsing. A group with no items yet (FINANCE before 04 ships) is hidden.

The assistant from 07 has no sidebar item. It opens from an "Ask" button in the header on every page.

### Behavior

- Staff see only the items they can use. Hiding an item doesn't replace the access check on the page itself.
- An item stays highlighted on its detail pages. Opening a lease keeps Leases highlighted.
- When the current page doesn't belong to any item, nothing is highlighted.
- Transactions shows a count of transactions needing review. The count updates as the operator moves between pages. A zero hides it.

### Page changes

- The dashboard is new and becomes the landing page in property mode.
- The old property page sends people to Settings, so bookmarks keep working.
- The Events placeholder page is removed.
- Unit management moves to the Units tab in Settings.

## Settings

Settings has a tab bar. Each tab has its own link.

| Tab | Added by |
|---|---|
| Property | 01 |
| Units | 01 |
| Categories | 01 |
| Cost pools | 01 |
| Bank accounts | 05 |

Categorization rules are not in Settings. Staff maintain them while categorizing, so they live on the Transactions screen (05).

### Property tab

The property name and a list of its street addresses.

- The addresses are the ones the city assigned to the building, used for occupancy filings. One building can have several.
- Each address is a street, city, state, and postal code, without a suite. Suites belong to units.
- A property needs at least one address. The first address on the list is the property's main address.
- An admin can add, edit, and reorder addresses. An address can't be removed while any unit uses it, including an archived unit.

### Units tab

A table with label, address, area, and occupancy, and an "Add unit" action that opens a side panel.

- Each unit picks one address from the property's list and can add an optional suite, such as #101. The table shows them together as "4708 #101".
- Area is required, in whole square feet above zero.
- When adding a unit, the side panel lists every pool with picked units as a checkbox, such as each shared water meter, so the admin decides which ones the unit joins. The unit and its pool choices save together. The unit joins building-wide pools automatically.
- When editing a unit, the side panel lists the unit's pools as read-only text with a link to the Cost pools tab. Pool membership is changed there.
- Total rentable area shows at the bottom of the table.
- Occupancy comes from leases and can't be set by hand. A unit shows "Occupied" with the tenant's name when it has a current lease, and "Vacant" when it has none. A unit being renovated or used by the owner is Vacant, and the owner pays its share of every pool.
- A lease is current from its start date until it ends. A month-to-month lease (02) stays current until an operator ends it with the move-out date. A lease is upcoming when its start date is after today. An upcoming lease doesn't make the unit Occupied.
- Units are never deleted, so their leases, charges, and reconciliation history stay intact.
- An admin archives a unit when the space no longer exists as its own unit, for example after combining two suites or splitting one. An archived unit leaves every pool, and it's hidden from the table and from unit pickers on leases and pools. A "Show archived" toggle on the table lists archived units, and their past leases still show them.
- A unit with a current or upcoming lease can't be archived. The operator ends a current lease with the move-out date first (02), and cancels an upcoming one.
- Archiving asks for confirmation and lists the cost pools the unit will leave.
- Archiving can't be undone. To bring a space back, the admin creates a new unit.

#### Unit area

A unit keeps a history of its area, with the month each value takes effect.

- Creating a unit records its first area. That month is when the unit starts counting toward pools.
- Editing the area asks for the new area and the month it takes effect. The month can be in the past or the future.
- The Units tab and the Cost pools tab show the area in effect this month.
- Monthly estimates on leases don't change when an area changes.
- An area change can't take effect in a year whose reconciliation is finalized (06).
- Reconciliation (06) works out shares month by month, using the units in each pool and their area in that month. The admin can adjust a year's areas before finalizing it.

#### Removed from units

- Bedrooms and bathrooms.
- Per-unit utility sharing. Shared utilities like water are cost pools now.
- Hand-set status. Occupancy comes from leases.
- The typed-in unit address. Units pick an address from the property's list instead.

There are no units in the system today, so nothing needs converting.

### Categories tab

A table of the property's categories with name, kind, and status. 05 adds a count of the transactions in each category.

Kinds:

| Kind | Meaning | Feeds reconciliation | In totals |
|---|---|---|---|
| Recoverable | Shared cost tenants pay a share of | yes | yes |
| Property expense | Cost the owner absorbs | no | yes |
| Income | Money in | no | yes |
| Transfer | Money between the property's own accounts | no | no |
| Excluded | Left out of property totals: personal items, security deposits | no | no |

Every property gets these default categories when a platform admin registers it. There are no existing properties to update.

| Category | Kind |
|---|---|
| CAM | Recoverable |
| Real Estate Tax | Recoverable |
| Insurance | Recoverable |
| Water | Recoverable |
| Repairs | Property expense |
| Utilities (owner paid) | Property expense |
| Tenant Payment | Income |
| Other Income | Income |
| Transfer | Transfer |
| Security Deposit | Excluded |
| Not property business | Excluded |

Rules:

- Names are unique per property, ignoring upper and lower case.
- A category's kind is set when it's created and never changes. To fix a wrong kind, the admin archives the category and creates a new one.
- Tenant Payment and Transfer can be renamed but not archived, because deposit matching (05) and transfer detection (05) depend on them.
- Categories are never deleted. Archiving hides a category from pickers and keeps it on existing records. Archiving can't be undone. A recoverable category can't be archived while any lease recovers costs from its pool.
- Creating a recoverable category creates its cost pool at the same time.
- Each recoverable category has exactly one pool. When a property has two shared meters for the same utility, each split among a different group of units, the admin creates one category per meter ("Water, meter A", "Water, meter B") and categorizes each bill to its meter. Units with their own meter stay out of the pool and pay the utility company directly.

### Cost pools tab

One card per recoverable category. Each card has:

- **Membership:**
  - **All units**: every unit on the property that isn't archived. New units join automatically and archived units leave. For building-wide costs like CAM.
  - **Picked units**: units the admin picks from the units that aren't archived. For a cost shared by some units, like a shared water meter. After a unit is created, this is the only place to change which of these pools it's in.
- **Share table.** Each unit's share is its area divided by the total area of the pool's units, using the area in effect this month. It updates as the admin edits, before saving:

```text
Water                        Membership: picked units   Total: 4,350 sqft
Unit        Sqft    Share
4704        2,910   66.90%
4708 #101     850   19.54%
4708 #102     590   13.56%
```

A unit in the pool still counts toward the total when it has no lease, or when its lease doesn't recover costs from the pool, for example a gross lease. The owner pays that unit's share (06).

Defaults:

| Pool | Membership |
|---|---|
| CAM, Real Estate Tax, Insurance | All units |
| Water | Picked units, none picked |
| Any pool an admin creates later | Picked units, none picked |

Water starts empty because only units on a shared meter belong in it, and the admin has to pick them.

A pool with no units shows a warning on its card. This happens with Water before the admin picks its units, with a pool whose units were all archived, and on a property with no units yet. No lease can recover costs from an empty pool, and billing (04) can't estimate charges for it.

Pools are never deleted directly. Archiving the category archives its pool.

Shares are shown to two decimals. Calculations use the exact values, so the displayed shares can add up to slightly more or less than 100%.

Every change to a pool's membership is kept in its history, so the admin can see who was in a pool and when.

## Dashboard

The dashboard shows work that needs attention. It is a list of cards, each with a count, a one-line description, and a link to the screen where the work gets done. Cards with nothing to show are hidden. When all are hidden, the page says "Nothing needs attention" with the date.

The dashboard covers the current property only. An operator with several properties switches property to see each one.

01 ships the dashboard with no cards, so it shows "Nothing needs attention" until later PRDs add them. Cards are sorted in a fixed order. Some cards are for admins only. If one card fails to load, the rest of the dashboard still shows. Staff land on the dashboard too, since most cards from 04 and 05 are staff work. Later PRDs add these cards:

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

## Edge cases

- **A unit in a pool is archived.** The admin confirms after seeing the pools the unit will leave. The unit leaves every pool. Finalized reconciliations don't change.
- **A unit with a current lease is archived.** Rejected, including when the lease is month to month. The operator ends the lease with the move-out date first (02).
- **A unit with an upcoming lease is archived.** Rejected. The unit shows Vacant, but the lease still needs it.
- **Two suites are combined.** The admin ends their leases if needed, archives both units, and creates the combined unit with its new area, effective from the month it opens. It joins building-wide pools automatically, and the admin picks its meter pools in the same form.
- **A unit is remeasured mid-year.** The admin enters the new area and the month it takes effect. The year's reconciliation uses the old area for earlier months and the new one after (06).
- **A unit created by mistake.** It can't be deleted. The admin archives it. If it was never in a lease, it only shows under "Show archived".
- **An admin wants to move an existing unit onto a shared meter.** The edit panel points to the Cost pools tab, where the admin adds the unit to the meter's pool.
- **A month-to-month tenant has moved out but the lease isn't ended.** The unit still shows "Occupied" and billing (04) keeps charging. The month-to-month dashboard card (02) is the prompt to end the lease.
- **Two shared water meters at one property.** The admin creates a second recoverable category for the second meter. Each gets its own pool and its own units.
- **A unit pays no share of a pool, like a gross lease.** It stays in the pool, and its lease doesn't recover costs from it. The owner pays its share.
- **Every unit in a picked-units pool is archived.** The pool card shows the empty-pool warning, and billing (04) can't estimate charges for that pool in the next charge run.
- **An address is removed while a unit uses it.** Rejected. The admin moves the unit to another address first.
- **Property has no units.** The Cost pools tab shows an empty state linking to Units.
- **A newly registered property.** It already has default categories and four cost pools. Each unit added joins CAM, Real Estate Tax, and Insurance automatically, and the unit form asks about Water.
- **A dashboard card fails to load.** The card is left out. The rest of the dashboard loads.
- **A staff member is made an admin while signed in.** Settings appears the next time they open a page.

## Acceptance criteria

1. The sidebar matches the layout above in property mode, with empty groups hidden, and every item opens the page it's named for.
2. The old property page sends people to Settings, property mode lands on the dashboard, and the Events page no longer exists.
3. Staff can't see Settings in the sidebar, are sent to the dashboard if they open it directly, and can't make admin-only changes.
4. A unit can't be created, and its area can't be changed, without a whole-number area above zero. Unit forms have no bedrooms, bathrooms, utilities, status, or typed-in address fields.
5. Registering a property creates the default categories and four cost pools: CAM, Real Estate Tax, and Insurance with all units, and Water with picked units and none picked.
6. Editing a pool's membership or units updates the share table before saving, and the exact shares add up to 100%.
7. A new unit joins every building-wide pool automatically, and its create form lets the admin choose its picked-units pools. After that, those pools only change on the Cost pools tab.
8. Archiving a unit asks for confirmation and lists the pools it leaves.
9. Categories can't be deleted, and a category's kind can't be changed. Archiving hides it from pickers but not from existing records.
10. The Units tab shows Occupied or Vacant for each unit, based on its current lease. A unit with only an upcoming lease shows Vacant.
11. Units can't be deleted. Archiving is blocked while the unit has a current or upcoming lease, and an archived unit drops out of pickers and pools but still shows on its past leases.
12. Each unit's address is picked from the property's address list, and an address in use can't be removed.
13. Changing a unit's area records the month it takes effect. Earlier months keep the old area, and a change can't take effect in a finalized reconciliation year.

## Open questions

1. Is "Not property business" the right default name for the excluded kind? "Personal" is too narrow, since security deposits and another business's spending also land there. "Not for this property" is an alternative.
