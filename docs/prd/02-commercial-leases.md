# 02. Commercial leases

Depends on: 01 (units, cost pools). Required by: 03, 04, 06.

## Summary

Turn a lease from "one tenant, one unit, one rent amount" into the terms a commercial lease actually has: base rent that steps up over time, the shared costs the tenant pays into, monthly estimates for those costs, flat charges like sign rent, and extension options. Give tenants the contact details a commercial operator needs. Replace the lease form with a guided creation flow and give each lease a detail page.

## Problem

- A lease has one rent amount. Commercial base rent changes on set dates over a multi-year term, so one number is wrong for most of the lease.
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

Staff and admins can do everything in this PRD (see Permissions in the README). Every change is recorded with who made it.

## Glossary

- **Rent step.** A base rent amount and the date it takes effect.
- **Recovery.** A lease's participation in one cost pool, with a history of monthly estimates.
- **Estimate.** The monthly amount a lease pays toward a cost pool, effective from a date.
- **Flat charge.** A named fixed monthly amount outside any pool, effective from a date, optionally ending.
- **Monthly total.** Base rent plus all estimates plus all flat charges in effect on a given date.
- **Extension option.** A tenant's right to extend the lease, with a length and a notice deadline.
- **Month to month.** An active lease past its end date with no renewal. The tenant is still in the unit and pays at the last terms until the lease is renewed or ended. Leases often call this "holdover".
- **Catch-up.** The difference between what was charged and what the new terms say, for months already charged. Posted by 04.

## User stories

- As an operator, I enter a ten-year rent schedule by giving a starting rent and a yearly increase, then fix the one year that doesn't follow the pattern.
- As an operator, I pick which shared costs a lease pays from a checklist, and the form shows the unit's share and suggests an estimate.
- As an operator, after reconciliation I change a lease's CAM estimate from January 1 forward, and the system tells me what it owes for months already charged.
- As an operator, I see a lease's whole life on a timeline: rent increases, estimate changes, option deadlines, and end date.
- As an operator, I get a dashboard warning 90 days before an option notice deadline.
- As an operator, I renew a lease when the tenant exercises an option or we negotiate new terms, and the tenant's ledger and history continue on the same lease.
- As an operator, I attach the signed amendment to the rent change it introduced, so anyone can see why the rent changed.
- As an operator, I record a tenant's legal name, trade name, mailing address, and several contacts, and mark one as primary for statements.

## Tenants

### Fields

| Field | Notes |
|---|---|
| Display name | Required. What operators call the tenant. Replaces the current full name. |
| Legal name | Optional. The entity on the lease. Printed on statements when present. |
| Mailing address | Optional. Entered like a property address (01). Statements use the unit address when it's empty. |
| Notes | As today. |
| Status | As today. |
| Contacts | Zero or more. |
| Bank aliases | Zero or more. Added from deposit matching in 05. Shown read-only here with a remove action. |

Each contact has a name, a role (free text, like "Owner" or "Accounts payable"), an email, a phone, and whether it's the primary contact. A tenant has at most one primary contact. The first contact added becomes primary.

Bank aliases are compared ignoring upper and lower case and extra spaces. A tenant can't have the same alias twice.

### Tenant screens

- The tenant list shows display name, legal name, primary contact, number of active leases, and total balance across leases (once 04 ships).
- The tenant page shows details, contacts, bank aliases, and a list of the tenant's leases with status and balance. A tenant with two leases sees both here.

## Lease terms

### Basics

Tenant, unit, start date, end date, deposit, and a prorate setting, on by default. Prorate tells billing (04) whether partial first and last months are charged by days or in full.

A lease is active once it's saved, and "End lease" marks it ended. There are no drafts.

Existing rules stay: end on or after start, active tenant required. A lease can't start before its unit's first month (01). Leases on the same unit can't overlap. The next tenant's lease can be entered ahead of time if it starts after the current lease's end date. A month-to-month lease has to be ended with its move-out date first.

A lease no longer has a single rent amount or a single attached document. Rent moves to the rent schedule, and documents move to 03.

### Rent schedule

An ordered list of steps, each with a date and a monthly amount.

Rules:

1. At least one step.
2. The first step's date is the lease start date.
3. Every step's date is on or before the end date.
4. No two steps share a date. Adding a step on a date that already has one replaces it.
5. Amounts are zero or more. Zero is allowed for free-rent months.
6. The first step can't be removed.

Base rent on a date is the latest step on or before it.

Changing the lease start date moves the first step's date with it, and moves any recovery or flat charge that started on the old start date. Changing the end date to before an existing step is rejected, and the error names the step. Ending a lease early is the exception (see "End a lease").

### Recoveries

One per cost pool the lease pays into. Each has a pool, a start date, an optional end date, and a list of estimates.

- The start date defaults to the lease start date. The end date defaults to empty, meaning "until the lease ends".
- Each estimate has a date and a monthly amount, with the same ordering rules as rent steps. The first estimate's date is the recovery start date. Every estimate's date falls within the recovery's dates.
- At most one recovery per pool per lease.
- The pool must belong to the lease's property and its category must not be archived.
- The lease's unit must be in the pool. If it isn't, the form says so and links to the pool settings. The form does not add units to pools; that's a Settings change with effects on other tenants.

### Flat charges

Each has a name, a monthly amount, a start date, and an optional end date. Changing an amount ends the current flat charge the day before the new one starts and creates a new one with the same name. The screen shows them as one line with history.

### Extension options

Each lease records how many options it has, the length of each option in months, the notice period (months before lease end the tenant must give notice), notes, and how many options have been exercised. The number of options can't be set below the number already exercised.

The next notice deadline is the end date minus the notice period. It's shown on the lease and feeds the dashboard.

Options are exercised through the renewal flow below.

### Monthly total

The monthly total is worked out from the terms whenever it's needed, never entered by hand. The lease shows the current monthly total with its breakdown, and 04 uses the same calculation to build charges.

## Renewals

A renewal keeps the same tenant in the same unit past the current end date. It extends the existing lease rather than creating a new one. That keeps one continuous ledger, one terms history, and one occupancy span for reconciliation (06), so a renewal mid-year doesn't split the tenant into two partial-year results.

Only an active lease can be renewed, including a month-to-month one. The new end date must be after the current end date, and the new rent steps must be dated after the current end date.

### Kinds

| Kind | When | Effect on options |
|---|---|---|
| Option | Tenant exercises an extension option from the lease | The exercised count goes up by one. Proposed length is the option length |
| Negotiated | Owner and tenant agree a renewal outside any option | None |

### Renew flow

"Renew lease" on the lease header opens a full-page form:

1. **Kind.** Option or negotiated. Option is only offered while the lease has options not yet exercised.
2. **New end date.** Proposed from the option length for options. Typed for negotiated renewals.
3. **Rent for the new term.** The rent schedule editor, showing existing steps read-only and adding steps after the current end date. "Fill from pattern" works here too, and it suggests continuing the last increase.
4. **Other changes** (optional). Estimate changes and flat charge changes that take effect with the renewal. They use the normal effective-date rules, including catch-up when the date is already charged.
5. **Options after renewal** (optional). Negotiated renewals often grant new options. The operator can set the number of options, their length, and the notice period again.
6. **Signed document.** Upload the extension or amendment, or pick one already uploaded (03). Type defaults to extension for options and amendment for negotiated renewals.

On save, everything is saved together: the end date moves, steps and other changes are added, every change records the renewal's source document, and the lease records the renewal with its kind, the previous and new end dates, and who made it.

### Do renewals need a document?

Strongly expected, not required. Renewals are often agreed before the paperwork is signed, and blocking the save would push operators to enter terms late or not at all. So:

- Saving without a document is allowed. The renewal is marked "Document missing".
- The lease header and the Documents tab show the flag, and a dashboard card lists renewals missing a document.
- Attaching the document later (from the lease or from 03's upload flow, by choosing "This is the document for the renewal on Mar 4") clears the flag. The document must be an extension or amendment for this lease.

### When it's a new lease instead

Create a new lease, and end the old one, when the unit changes (tenant relocates), when the tenant entity changes (assignment to a new company), or when the owner wants a clean ledger. The old lease's balance stays on its ledger. Moving it to the new lease is a manual credit on one and charge on the other in 04, each with a memo naming the other lease.

## Source documents for terms

Every term change can name the document that justifies it, from the lease's documents in 03.

- Rent steps, recovery estimates, flat charges, options changes, and renewals can all name a source document. It must be one of this lease's documents.
- The terms history shows it: "Rent step $3,300 from Jul 1, 2026. Source: Amendment 2 (uploaded Mar 4)", with a link to preview the file.
- The create-lease flow defaults every initial term's source to the signed lease document, once one is uploaded.
- When someone uploads an amendment or extension to a lease (03), the review step offers "Update lease terms from this document". Choosing it opens the Terms tab with that document preselected as the source. Skipping it saves the document and adds a dashboard item, "Amendment uploaded, terms not updated".
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

  "Save and post catch-up" saves the terms and posts catch-up charges (04): one entry per affected month, with the same kind and cost pool as the line that changed (see "Catch-up" in 04). The terms and the catch-up charges save together, or neither saves. That keeps estimate totals per pool and per year correct for 06. "Save without catch-up" is for cases the operator handles another way. Posted charges are never rewritten either way.

- Before 04 ships, there are no charges, so every change just saves.

Every change is recorded with the before and after values, the effective date, the source document, and the operator who made it. The Terms tab has a "History" view listing these in order.

## Flows

### Create a lease

Creating a lease is a full page with a section list on the left. Sections can be filled in any order. Only Basics and Base rent are required to save.

1. **Basics.** Tenant (search, or "New tenant" inline), unit (archived units never appear), start and end dates, deposit, prorate toggle.
2. **Base rent.** The schedule editor:
   - A table of steps with date and amount, add and remove rows.
   - "Fill from pattern": starting amount, increase as a percent or fixed amount, every N months, starting on a date. It fills steps through the end date, rounded to the cent. Existing rows after the pattern start are replaced after a confirm.
   - A small step chart of monthly rent over the term.
   - A "first month free" shortcut that adds a $0 step at the start date.
3. **Shared costs.** A checklist of the property's cost pools. Each checked row shows the unit's current share and an estimate field. When the pool has a prior year of actual costs (from 05), the field suggests last year's cost times the unit's share, divided by 12, labelled as a suggestion.
4. **Flat charges.** Name, amount, start date, optional end date.
5. **Options.** Count, length, notice period, notes.
6. **Documents.** Upload area from 03. Hidden until 03 ships.

A summary panel on the right shows the monthly total today and on the start date, and any validation errors by section.

"Save" creates the lease as active, after checking that it doesn't overlap another lease on the unit.

### Lease detail

Header: tenant, unit, dates, status badge, monthly total, balance (from 04), and a "Document missing" flag when a renewal has no signed document. Actions: Edit basics, Renew lease, End lease, Cancel lease.

| Tab | Contents | Added by |
|---|---|---|
| Overview | Timeline and upcoming events | 02 |
| Terms | Rent schedule, recoveries, flat charges, options, history | 02 |
| Ledger | Charges, payments, balance | 04 |
| Documents | Lease documents | 03 |
| Reconciliations | Year-end statements | 06 |

**Overview timeline.** A horizontal timeline from start to end with markers for rent steps, estimate changes, flat charge changes, renewals (showing the original and extended end dates), option deadlines, and the end date. Today is marked. Below it, a list of the next three upcoming events with dates and amounts.

**Terms tab.** Each section is a table with an "Edit" action that opens a side sheet. Amount edits use the effective date flow above. Past rows are shown greyed with their date range.

### End a lease

"End lease" asks for the end date, which is the day the tenant moved out. It defaults to the current end date and may be earlier for an early termination. For a month-to-month lease it defaults to today and may be later than the end date, since the tenant stayed past the term. Only a month-to-month lease can end after its end date. Ending marks the lease ended and, if the date differs from the end date, moves the end date. Recoveries and flat charges stop on that date. Rent steps after the new end date are removed from the lease, and the lease keeps a record of the original end date and the removed steps. 04 prorates the final month if prorate is on.

An ended lease can't be changed. It can only be viewed.

### Cancel a lease

"Cancel lease" deletes a lease that has nothing on its ledger. It's for a signed lease that falls through before move-in, or a lease entered by mistake. It asks for confirmation, then removes the lease with its terms, recoveries, flat charges, and options. Its documents are archived (03), since documents are never deleted. The deletion is recorded with who made it.

Once a lease has any ledger entry (04), it can't be cancelled. It can only be ended.

A tenant often pays before a deal falls through. When that payment came from a bank deposit match, the cancel action says so and links to the deposit. The operator unmatches it in Transactions (05), which takes the payment off the ledger, and then cancels the lease. Usually the money is kept, and the deposit is categorized as Other Income. When it's refunded, the outgoing refund is categorized as Other Income too, so the two cancel out.

### Lease list

Columns: tenant, unit, start, end, monthly total, balance, status. Filters: status, ending in 90 days, has balance. Default sort: unit label. Ended leases are shown under a status filter, not by default.

## Screen states

- **No tenants yet.** Basics on the create-lease page offers "New tenant" inline instead of an empty picker.
- **No cost pools** (every recoverable category archived). The Shared costs section explains and links to Settings.
- **Unit not in a pool.** The checklist row is disabled with "This unit isn't in the Water pool" and a link to the pool.
- **Unsaved changes.** Leaving the create-lease page or an edit sheet with changes asks for confirmation.
- **Lease past its end date and still active.** The lease header and the lease list show a "Month to month" badge. Dashboard lists it.

## Edge cases

- **Rent step on a date mid-month.** Base rent for that month is split by days when prorate is on, and 04 charges two lines. With prorate off, the step in effect on the first day the lease is active that month applies to the whole month.
- **Lease starts on the 15th.** First month prorated by days, if prorate is on.
- **Pattern fill produces fractional cents.** Each step rounds to the cent independently from the unrounded running amount, so rounding doesn't compound.
- **Estimate change effective before the recovery started.** Rejected.
- **Pool later loses this unit** (an operator edits the pool in 01). The recovery stays. The Terms tab and 04's charge run preview warn that the unit is no longer in the pool. 06's checklist blocks finalizing that year until an operator adds the unit to the year's pool settings or ends the recovery.
- **Tenant with two leases.** Each lease has its own terms, ledger, and statements. The tenant page shows both.
- **Two operators edit terms at once.** The second save gets a conflict and reloads.
- **Exercising the last option.** The renew form stops offering the option kind. Negotiated renewals are still available.
- **Renewing a month-to-month lease.** Allowed. The new term's first step is dated the day after the old end date. Months already charged at the old terms get the normal catch-up offer if the new rent applies to them.
- **Month-to-month tenant moves out.** "End lease" with the move-out date, which is after the original end date. The lease keeps a record of the original end date. 04 keeps charging through the move-out date and prorates the last one if prorate is on.
- **Renewing an ended lease.** Not allowed. Create a new lease for the same tenant and unit.
- **Signed lease falls through before it starts.** "Cancel lease" deletes it, as long as nothing is on its ledger. A prepayment matched from a bank deposit is unmatched first, then kept as Other Income or refunded.
- **Renewal saved before 03 ships.** No documents exist, so every renewal has no document. The "Document missing" flag isn't shown until 03 ships.

## Acceptance criteria

1. A lease can't be saved without at least one rent step dated on the start date.
2. "Fill from pattern" with $2,000, 2% every 12 months, over 10 years, produces 10 steps that match a hand calculation to the cent.
3. The monthly breakdown on any date equals the sum of the step, estimates, and flat charges in effect that day.
4. Changing an estimate effective in a charged month shows the catch-up table, and both save options work as described. Posted charges never change.
5. Adding a recovery for a pool the unit isn't in is rejected with a message naming the pool.
6. The Overview timeline shows every rent step, estimate change, renewal, option deadline, and the end date.
7. Renewing a lease, by option or negotiated, moves the end date and adds the entered steps on the same lease. An option renewal increments the exercised count. The ledger stays continuous across the renewal.
8. A renewal saved without a signed document shows "Document missing" on the lease and the dashboard. Attaching an extension or amendment clears it.
9. A term change made with a source document shows that document, linked, in the terms history. A change without one shows "No source document".
10. The terms history lists every amount change with before, after, effective date, source document, and who made it.
11. Dashboard shows leases ending in 90 days, option deadlines in 90 days, and renewals missing a document.
12. A lease with nothing on its ledger can be cancelled, which deletes it and archives its documents. A lease with any ledger entry can't be cancelled. When those entries are payments from bank matches, the cancel action links to them to unmatch first.

## Open questions

1. Should a lease allow more than one unit (a tenant leasing two adjacent suites on one lease)? This PRD assumes one unit per lease, which matches the current model.
2. Do any leases bill quarterly or annually instead of monthly? This PRD assumes monthly.
