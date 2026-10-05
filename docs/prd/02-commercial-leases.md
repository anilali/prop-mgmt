# 02. Commercial leases

Depends on: 01 (units, cost pools). Required by: 03, 04, 06.

## Summary

Turn a lease from "one tenant, one unit, one rent amount" into the terms a commercial lease actually has: base rent that steps up over time, the shared costs the tenant pays into, monthly estimates for those costs, flat charges like sign rent, and extension options. Give tenants the contact details a commercial operator needs. Replace the lease form with a guided creation flow and give each lease a detail page.

## Problem

- A lease stores one `rentCents`. Commercial base rent changes on set dates over a multi-year term, so one number is wrong for most of the lease.
- Nothing records which shared costs a tenant pays, or how much they pay each month toward them. Billing (04) and reconciliation (06) can't work without it.
- Estimates change every year after reconciliation. There's no way to change an amount from a date forward and keep the history.
- Extension options and their notice deadlines live in people's heads.
- A tenant has one name, email, and phone. Commercial tenants have a legal entity name, a trade name, a mailing address separate from the unit, and several contacts.

## Goals

- Every amount a lease charges in any month can be read from its terms, without looking at a spreadsheet.
- Changing an amount from a date forward is one action, and the old amount stays in history.
- Creating a lease with ten years of rent steps takes under two minutes.
- An operator sees option deadlines and lease ends coming before they pass.

## Non-goals

- Lease-specific recovery terms like exclusions and caps.
- Percentage rent based on tenant sales.
- Rent in currencies other than USD.
- Generating lease documents from templates.

## Users and permissions

| Action | Staff | Admin |
|---|---|---|
| View tenants and leases | yes | yes |
| Create and edit tenants and contacts | yes | yes |
| Create and edit draft leases | yes | yes |
| Activate a lease | no | yes |
| Change terms on an active lease (rent steps, recoveries, estimates, flat charges, options) | no | yes |
| Post catch-up charges | no | yes |
| Renew a lease (option or negotiated), end a lease | no | yes |

Terms on an active lease decide what every future charge run bills, and retroactive changes post charges for past months. So once a lease is active, only admins change it. Staff can prepare a lease as a draft and hand it to an admin to activate. Every change is recorded with who made it.

## Glossary

- **Rent step.** A base rent amount and the date it takes effect.
- **Recovery.** A lease's participation in one cost pool, with a history of monthly estimates.
- **Estimate.** The monthly amount a lease pays toward a cost pool, effective from a date.
- **Flat charge.** A named fixed monthly amount outside any pool, effective from a date, optionally ending.
- **Monthly total.** Base rent plus all estimates plus all flat charges in effect on a given date.
- **Extension option.** A tenant's right to extend the lease, with a length and a notice deadline.
- **Month to month.** An active lease past its end date with no renewal. The tenant is still in the unit and pays at the last terms until the lease is renewed or ended. Leases often call this "holdover". The status is computed from `status = active` and `endDate` before today, and it isn't stored.
- **Catch-up.** The difference between what was charged and what the new terms say, for months already charged. Posted by 04.

## User stories

- As an operator, I enter a ten-year rent schedule by giving a starting rent and a yearly increase, then fix the one year that doesn't follow the pattern.
- As an operator, I pick which shared costs a lease pays from a checklist, and the form shows the unit's share and suggests an estimate.
- As an operator, after reconciliation I change a lease's CAM estimate from January 1 forward, and the system tells me what it owes for months already charged.
- As an operator, I see a lease's whole life on a timeline: rent increases, estimate changes, option deadlines, and end date.
- As an operator, I get a dashboard warning 90 days before an option notice deadline.
- As an admin, I renew a lease when the tenant exercises an option or we negotiate new terms, and the tenant's ledger and history continue on the same lease.
- As an admin, I attach the signed amendment to the rent change it introduced, so anyone can see why the rent changed.
- As an operator, I record a tenant's legal name, trade name, mailing address, and several contacts, and mark one as primary for statements.

## Tenants

### Fields

| Field | Notes |
|---|---|
| `displayName` | Required. What operators call the tenant. Replaces `fullName`. |
| `legalName` | Optional. The entity on the lease. Printed on statements when present. |
| `mailingAddress` | Optional. Same shape as property addresses. Defaults to the unit address on statements when empty. |
| `notes` | As today. |
| `status` | As today. |
| `contacts` | Zero or more. |
| `bankAliases` | Zero or more strings. Managed from deposit matching in 05. Shown read-only here with a remove action. |

Contact fields: `name`, `role` (free text, like "Owner" or "Accounts payable"), `email`, `phone`, `isPrimary`. At most one primary contact per tenant. The first contact added becomes primary.

Migration: `fullName` becomes `displayName`. Existing `email` and `phone` become one primary contact named after the tenant, when either is present.

### Tenant screens

- `/tenants` lists display name, legal name, primary contact, number of active leases, and total balance across leases (once 04 ships).
- `/tenants/[tenantId]` shows details, contacts, bank aliases, and a list of the tenant's leases with status and balance. A tenant with two leases sees both here.

## Lease terms

### Basics

`tenantId`, `unitId`, `startDate`, `endDate`, `depositCents`, `status`, and `prorate` (boolean, default true). `prorate` tells 04 whether partial first and last months are charged by days or in full.

Existing rules stay: end on or after start, one active lease per unit, active tenant required.

### Rent schedule

An ordered list of steps: `effectiveDate`, `monthlyCents`.

Invariants:

1. At least one step.
2. The first step's `effectiveDate` equals the lease `startDate`.
3. Every step's date is on or before `endDate`.
4. No two steps share a date.
5. `monthlyCents >= 0`. Zero is allowed for free-rent months.

Base rent on a date is the latest step on or before it.

Changing the lease start date moves the first step's date with it, and moves any recovery or flat charge that started on the old start date. Changing the end date to before an existing step is rejected, and the error names the step. Ending a lease early is the exception (see "End a lease").

### Recoveries

One per cost pool the lease pays into. Fields: `poolId`, `startDate`, `endDate` (optional), `estimates`.

- `startDate` defaults to the lease start date. `endDate` defaults to empty, meaning "until the lease ends".
- `estimates` is a list of `effectiveDate`, `monthlyCents`, with the same ordering rules as rent steps. The first estimate's date equals the recovery start date.
- At most one recovery per pool per lease.
- The pool must belong to the lease's property and its category must not be archived.
- The lease's unit must be a participating unit in the pool. If it isn't, the form says so and links to the pool settings. The form does not add units to pools; that's an admin setting with effects on other tenants.

### Flat charges

Fields: `name`, `monthlyCents`, `startDate`, `endDate` (optional). Changing an amount ends the current flat charge the day before the new one starts and creates a new one with the same name. The UI shows them as one line with history.

### Extension options

Fields: `count` (how many options), `termMonths`, `noticeDeadlineMonths` (months before lease end the tenant must give notice), `notes`, `exercisedCount`.

The next notice deadline is `endDate` minus `noticeDeadlineMonths`. It's shown on the lease and feeds the dashboard.

Options are exercised through the renewal flow below.

### Monthly total

Derived, never stored. The lease shows the current monthly total with its breakdown, and 04 uses the same function to build charges:

```text
monthlyBreakdown(lease, date) =
  base rent step in effect on date
  + each recovery active on date: its estimate in effect on date
  + each flat charge active on date: its amount
```

This function lives in the LeaseMgmt domain package and is pure. 04 calls it; it does not reimplement it.

## Renewals

A renewal keeps the same tenant in the same unit past the current end date. It extends the existing lease record rather than creating a new one. That keeps one continuous ledger, one terms history, and one occupancy span for reconciliation (06), so a renewal mid-year doesn't split the tenant into two partial-year results.

### Kinds

| Kind | When | Effect on options |
|---|---|---|
| `option` | Tenant exercises an extension option from the lease | `exercisedCount` goes up by one. Proposed length is `termMonths` |
| `negotiated` | Owner and tenant agree a renewal outside any option | None |

### Renew flow

"Renew lease" on the lease header (admin only) opens a full-page form:

1. **Kind.** Option or negotiated. Option is only offered while `exercisedCount < count`.
2. **New end date.** Proposed from `termMonths` for options. Typed for negotiated renewals.
3. **Rent for the new term.** The rent schedule editor, showing existing steps read-only and adding steps after the current end date. "Fill from pattern" works here too, and it suggests continuing the last increase.
4. **Other changes** (optional). Estimate changes and flat charge changes that take effect with the renewal. They use the normal effective-date rules, including catch-up when the date is already charged.
5. **Options after renewal** (optional). Negotiated renewals often grant new options. The operator can set `count`, `termMonths`, and `noticeDeadlineMonths` again.
6. **Signed document.** Upload the extension or amendment, or pick one already uploaded (03). Type defaults to `extension` for options and `amendment` for negotiated renewals.

On save, in one transaction: `endDate` moves, steps and other changes are added, every change records the renewal's source document, and a renewal record is written with the previous and new end dates.

### Do renewals need a document?

Strongly expected, not required. Renewals are often agreed before the paperwork is signed, and blocking the save would push operators to enter terms late or not at all. So:

- Saving without a document is allowed. The renewal is marked "Document missing".
- The lease header and the Documents tab show the flag, and a dashboard card lists renewals missing a document.
- Attaching the document later (from the lease or from 03's upload flow, by choosing "This is the document for the renewal on Mar 4") clears the flag.

### When it's a new lease instead

Create a new lease, and end the old one, when the unit changes (tenant relocates), when the tenant entity changes (assignment to a new company), or when the owner wants a clean ledger. The old lease's balance stays on its ledger. Moving it to the new lease is a manual credit on one and charge on the other in 04, each with a memo naming the other lease.

## Source documents for terms

Every term change can name the document that justifies it: `sourceDocumentId`, pointing at a document in 03.

- Rent steps, recovery estimates, flat charges, options changes, and renewals all accept an optional `sourceDocumentId`.
- The terms history shows it: "Rent step $3,300 from Jul 1, 2026. Source: Amendment 2 (uploaded Mar 4)", with a link to preview the file.
- The create-lease flow defaults every initial term's source to the signed `lease` document, once one is uploaded.
- When someone uploads an `amendment` or `extension` to a lease (03), the review step offers "Update lease terms from this document". Admins go to the Terms tab with that document preselected as the source. Staff get the document saved and a dashboard item for admins: "Amendment uploaded, terms not updated".
- A term change without a source is allowed. The history marks it "No source document".

The link is for tracing and review. The system never reads the document to check that the terms match it.

## Changing terms on an active lease

Any change to an amount (rent step, estimate, flat charge) asks for an effective date.

- **Effective date in the future, or in a month not yet charged.** The change saves. The next charge run uses it.
- **Effective date in a month already charged.** Once 04 ships, the form shows a catch-up table before saving:

```text
CAM estimate changes from $268.61 to $287.25, effective Jan 1.
Jan, Feb, Mar are already charged.

Month   Charged    New terms   Difference
Jan     $268.61    $287.25     $18.64
Feb     $268.61    $287.25     $18.64
Mar     $268.61    $287.25     $18.64
                               $55.92

[ Save and post catch-up charge ]   [ Save without catch-up ]   [ Cancel ]
```

  "Save and post catch-up" saves the terms and calls 04 to post catch-up charges: one entry per affected month, with the same kind and cost pool as the line that changed (see "Catch-up" in 04). That keeps estimate totals per pool and per year correct for 06. "Save without catch-up" is for cases the operator handles another way. Posted charges are never rewritten either way.

- Before 04 ships, there are no charges, so every change just saves.

Every change produces an event with the before and after values and the acting operator. The Terms tab has a "History" view listing these in order.

## Flows

### Create a lease

`/leases/new` is a full page with a section list on the left. Sections can be filled in any order. Only Basics and Base rent are required to save.

1. **Basics.** Tenant (search, or "New tenant" inline), unit (archived units never appear, and units with an active lease appear only when creating a draft), start and end dates, deposit, prorate toggle.
2. **Base rent.** The schedule editor:
   - A table of steps with date and amount, add and remove rows.
   - "Fill from pattern": starting amount, increase as a percent or fixed amount, every N months, starting on a date. It fills steps through the end date, rounded to the cent. Existing rows after the pattern start are replaced after a confirm.
   - A small step chart of monthly rent over the term.
   - A "first month free" shortcut that adds a $0 step at the start date.
3. **Shared costs.** A checklist of the property's cost pools. Each checked row shows the unit's current share and an estimate field. When the pool has a prior year of actual costs (from 05), the field suggests `last year's cost × share ÷ 12`, labelled as a suggestion.
4. **Flat charges.** Name, amount, start date, optional end date.
5. **Options.** Count, length, notice period, notes.
6. **Documents.** Upload area from 03. Hidden until 03 ships.

A summary panel on the right shows the monthly total today and on the start date, and any validation errors by section.

"Save as draft" saves with status `draft`. "Save and activate" also activates, which runs the existing one-active-lease-per-unit check. Staff only see "Save as draft". Their drafts show to admins as "Ready to activate" on the lease list.

### Lease detail

`/leases/[leaseId]`. Header: tenant, unit, dates, status badge, monthly total, balance (from 04), and a "Document missing" flag when a renewal has no signed document. Actions: Edit basics, Renew lease, End lease.

| Tab | Route | Contents | Added by |
|---|---|---|---|
| Overview | `/leases/[id]` | Timeline and upcoming events | 02 |
| Terms | `/leases/[id]/terms` | Rent schedule, recoveries, flat charges, options, history | 02 |
| Ledger | `/leases/[id]/ledger` | Charges, payments, balance | 04 |
| Documents | `/leases/[id]/documents` | Lease documents | 03 |
| Reconciliations | `/leases/[id]/reconciliations` | Year-end statements | 06 |

**Overview timeline.** A horizontal timeline from start to end with markers for rent steps, estimate changes, flat charge changes, renewals (showing the original and extended end dates), option deadlines, and the end date. Today is marked. Below it, a list of the next three upcoming events with dates and amounts.

**Terms tab.** Each section is a table with an "Edit" action that opens a side sheet. Amount edits use the effective date flow above. Past rows are shown greyed with their date range. On an active lease, staff see the tab read-only, without Edit actions.

### End a lease

"End lease" asks for the end date, which is the day the tenant moved out. It defaults to the current end date and may be earlier for an early termination. For a month-to-month lease it defaults to today and may be later than `endDate`, since the tenant stayed past the term. Ending sets status `ended` and, if the date differs from `endDate`, moves `endDate`. Recoveries and flat charges stop on that date. Rent steps after the new end date are removed from the lease, and the `LeaseEnded` event records the original end date and the removed steps. 04 prorates the final month if `prorate` is on.

### Lease list

`/leases` columns: tenant, unit, start, end, monthly total, balance, status. Filters: status, ending in 90 days, has balance. Default sort: unit label. Draft and ended leases are shown under a status filter, not by default.

## Screen states

- **No tenants yet.** `/leases/new` Basics offers "New tenant" inline instead of an empty picker.
- **No cost pools** (every recoverable category archived). The Shared costs section explains and links to Settings for admins.
- **Unit not in a pool.** The checklist row is disabled with "This unit isn't in the Water pool" and a link for admins.
- **Unsaved changes.** Leaving `/leases/new` or an edit sheet with changes asks for confirmation.
- **Lease past its end date and still active.** The lease header and the lease list show a "Month to month" badge. Dashboard lists it.

## Domain model

### Tenant (aggregate, extended)

New fields as above. Contacts are entities inside the aggregate.

| Command | Event |
|---|---|
| `UpdateTenantDetails(displayName, legalName, mailingAddress, notes)` | `TenantDetailsUpdated` |
| `AddContact`, `UpdateContact`, `RemoveContact`, `SetPrimaryContact` | `TenantContactChanged` |
| `AddBankAlias(alias)`, `RemoveBankAlias(alias)` | `TenantBankAliasAdded`, `TenantBankAliasRemoved` |

Bank aliases are normalized (uppercased, whitespace collapsed) and unique per tenant.

### Lease (aggregate, extended)

The aggregate holds basics, rent steps, recoveries with their estimates, flat charges, and options. All are small lists, so loading them together is cheap and lets the aggregate check every invariant. An optimistic `version` column guards concurrent edits.

`rentCents` and the single `document` field are removed. Documents move to 03.

| Command | Rules | Event |
|---|---|---|
| `CreateLease(basics, steps, recoveries, flatCharges, options)` | All invariants | `LeaseCreated` |
| `UpdateBasics(startDate, endDate, depositCents, prorate)` | Steps stay inside dates | `LeaseBasicsUpdated` |
| `SetRentStep(effectiveDate, monthlyCents)` | Adds or replaces the step on that date | `RentStepSet` |
| `RemoveRentStep(effectiveDate)` | Not the first step | `RentStepRemoved` |
| `AddRecovery(poolId, startDate, monthlyCents)` | One per pool | `RecoveryAdded` |
| `SetEstimate(recoveryId, effectiveDate, monthlyCents)` | Date within recovery | `EstimateSet` |
| `EndRecovery(recoveryId, endDate)` | | `RecoveryEnded` |
| `AddFlatCharge(name, monthlyCents, startDate, endDate?)` | | `FlatChargeAdded` |
| `ChangeFlatCharge(flatChargeId, effectiveDate, monthlyCents)` | Ends old, starts new | `FlatChargeChanged` |
| `EndFlatCharge(flatChargeId, endDate)` | | `FlatChargeEnded` |
| `SetOptions(count, termMonths, noticeDeadlineMonths, notes)` | `count >= exercisedCount` | `LeaseOptionsSet` |
| `Renew(kind, newEndDate, steps, termChanges, options?, sourceDocumentId?)` | Lease is `active`. `newEndDate` after current `endDate`. New steps dated after current `endDate`. `option` requires `exercisedCount < count` | `LeaseRenewed` |
| `AttachRenewalDocument(renewalId, documentId)` | Document is an `extension` or `amendment` linked to this lease | `RenewalDocumentAttached` |
| `Activate()`, `End(endDate)` | As today, with end date. Ending early removes later rent steps. A date after `endDate` is allowed only for a month-to-month lease | `LeaseActivated`, `LeaseEnded` |

Every command that adds or changes a term accepts an optional `sourceDocumentId`. Amount-changing events carry `before`, `after`, `effectiveDate`, `sourceDocumentId`, and `actorAuthUserId`. The terms history view reads these events. `LeaseRenewed` carries the kind, previous and new end dates, and the renewal id.

The aggregate checks that a source document exists and is linked to this lease through a LeaseMgmt query port, since documents are a separate aggregate in the same context.

Ended leases reject every command except reading.

## API

| Procedure | Kind | Notes |
|---|---|---|
| `tenant.get`, `tenant.list` | query | Include contacts and aliases |
| `tenant.updateDetails` | mutation | |
| `tenant.addContact`, `tenant.updateContact`, `tenant.removeContact`, `tenant.setPrimaryContact` | mutation | |
| `tenant.removeBankAlias` | mutation | Adding happens in 05 |
| `lease.create` | mutation | Full nested input |
| `lease.get` | query | Basics, terms, current monthly breakdown, next deadline |
| `lease.list` | query | Adds monthly total and filters |
| `lease.updateBasics` | mutation | Includes `version` |
| `lease.setRentStep`, `lease.removeRentStep` | mutation | Includes `version` |
| `lease.fillRentSteps` | query | Input pattern. Returns proposed steps without saving |
| `lease.addRecovery`, `lease.setEstimate`, `lease.endRecovery` | mutation | |
| `lease.addFlatCharge`, `lease.changeFlatCharge`, `lease.endFlatCharge` | mutation | |
| `lease.setOptions` | mutation | |
| `lease.renew` | mutation | Admin. Input kind, new end date, steps, term changes, options, `sourceDocumentId?`, `postCatchUp?` |
| `lease.attachRenewalDocument` | mutation | Clears "Document missing" |
| `lease.renewalsMissingDocument` | query | For the dashboard card |
| `lease.previewTermChange` | query | Input is a proposed change. Returns the catch-up table from 04, or empty |
| `lease.monthlyBreakdown` | query | Input `{ leaseId, date }` |
| `lease.timeline` | query | Events for the Overview tab |
| `lease.termsHistory` | query | |
| `lease.suggestEstimates` | query | Input `{ unitId, poolIds }`. Uses 05 data when present |

Lease mutations run on `propertyAdminProcedure` when the lease is not a draft, and on `propertyProcedure` for drafts. `lease.activate`, `lease.renew`, and `lease.end` are always admin. The service checks the lease's status before choosing, so a staff member's edit to a lease that was activated in the meantime is rejected with `FORBIDDEN`.

Mutations that change amounts accept an optional `postCatchUp: boolean`. When true, the service saves the lease and calls Billing to post the catch-up in the same database transaction.

## Data model

```text
tenant_mgmt.tenants
  ~ full_name -> display_name
  + legal_name           varchar(255)
  + mailing_address      json
  - email, phone         (moved to contacts)

tenant_mgmt.contacts
  id, tenant_id (fk cascade), name, role, email, phone, is_primary
  unique (tenant_id) where is_primary

tenant_mgmt.bank_aliases
  tenant_id (fk cascade), alias
  primary key (tenant_id, alias)

lease_mgmt.leases
  - rent_cents
  - document_* columns   (moved by 03)
  + prorate              boolean not null default true
  + version              integer not null default 0
  + options_count, options_term_months, options_notice_months,
    options_exercised_count, options_notes

lease_mgmt.rent_steps
  lease_id (fk cascade), effective_date date, monthly_cents bigint, source_document_id uuid
  primary key (lease_id, effective_date)

lease_mgmt.recoveries
  id, lease_id (fk cascade), pool_id, start_date, end_date,
  source_document_id uuid
  unique (lease_id, pool_id)

lease_mgmt.recovery_estimates
  recovery_id (fk cascade), effective_date date, monthly_cents bigint, source_document_id uuid
  primary key (recovery_id, effective_date)

lease_mgmt.flat_charges
  id, lease_id (fk cascade), name, monthly_cents bigint, start_date, end_date, source_document_id uuid

lease_mgmt.renewals
  id                  uuid pk
  lease_id            uuid not null references leases on delete cascade
  kind                varchar(16) not null        -- 'option' or 'negotiated'
  previous_end_date   date not null
  new_end_date        date not null
  source_document_id  uuid                        -- null means "Document missing"
  created_by          text not null
  created_at          timestamp not null default now()
  index (lease_id)
```

`source_document_id` columns reference `lease_mgmt.documents` (03). They're nullable, and the foreign key is added in 03's migration, since 02 ships first.

Migration: for each existing lease, insert one rent step from `rent_cents` on `start_date`, then drop `rent_cents`.

## Edge cases

- **Rent step on a date mid-month.** Base rent for that month is split by days when `prorate` is on, and 04 charges two lines. With `prorate` off, the step in effect on the first day the lease is active that month applies to the whole month.
- **Lease starts on the 15th.** First month prorated by days, if `prorate` is on.
- **Pattern fill produces fractional cents.** Each step rounds to the cent independently from the unrounded running amount, so rounding doesn't compound.
- **Estimate change effective before the recovery started.** Rejected.
- **Pool later loses this unit** (admin edits pool in 01). The recovery stays. The Terms tab and 04's charge run preview warn that the unit is no longer in the pool. 06's checklist blocks finalizing that year until an admin adds the unit to the year's pool settings or an operator ends the recovery.
- **Tenant with two leases.** Each lease has its own terms, ledger, and statements. The tenant page shows both.
- **Two operators edit terms at once.** The second save gets a conflict and reloads.
- **Exercising the last option.** The renew form stops offering the `option` kind. Negotiated renewals are still available.
- **Renewing a month-to-month lease.** Allowed. The new term's first step is dated the day after the old end date. Months already charged at the old terms get the normal catch-up offer if the new rent applies to them.
- **Month-to-month tenant moves out.** "End lease" with the move-out date, which is after the original end date. The `LeaseEnded` event records the original end date. 04 keeps charging through the move-out date and prorates the last one if `prorate` is on.
- **Renewing an ended lease.** Not allowed. Create a new lease for the same tenant and unit.
- **Renewal saved before 03 ships.** No documents exist, so every renewal is "Document missing" until 03's migration. The flag isn't shown until 03 ships.

## Acceptance criteria

1. A lease can't be saved without at least one rent step dated on the start date.
2. "Fill from pattern" with $2,000, 2% every 12 months, over 10 years, produces 10 steps that match a hand calculation to the cent.
3. The monthly breakdown on any date equals the sum of the step, estimates, and flat charges in effect that day.
4. Changing an estimate effective in a charged month shows the catch-up table, and both save options work as described. Posted charges never change.
5. Adding a recovery for a pool the unit isn't in is rejected with a message naming the pool.
6. The Overview timeline shows every rent step, estimate change, renewal, option deadline, and the end date.
7. Renewing a lease, by option or negotiated, moves the end date and adds the entered steps on the same lease record. An option renewal increments the exercised count. The ledger stays continuous across the renewal.
8. A renewal saved without a signed document shows "Document missing" on the lease and the dashboard. Attaching an `extension` or `amendment` clears it.
9. A term change made with a source document shows that document, linked, in the terms history. A change without one shows "No source document".
10. Existing leases migrate with one rent step and no data loss. Existing tenant email and phone become a primary contact.
11. The terms history lists every amount change with before, after, effective date, source document, and who made it.
12. Dashboard shows leases ending in 90 days, option deadlines in 90 days, and renewals missing a document.

## Open questions

1. Should a lease allow more than one unit (a tenant leasing two adjacent suites on one lease)? This PRD assumes one unit per lease, which matches the current model.
2. Do any leases bill quarterly or annually instead of monthly? This PRD assumes monthly.
