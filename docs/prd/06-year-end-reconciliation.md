# 06. Year-end reconciliation

Depends on: 01 (cost pools), 02 (recoveries), 03 (statements saved as documents), 04 (estimates billed, reconciliation entries), 05 (actual costs). Completes the set.

## Summary

Once a year, for each property, the operator adds up what each shared cost actually was, works out each lease's share, compares it with the estimates the lease was billed, and bills or credits the difference. The portal does this in a workspace: a checklist that makes sure the year's data is complete, cost totals that link to their transactions, a live statement for every lease, and a finalize step that posts the results, locks the year, saves statement PDFs, and sets next year's estimates.

The calculation has three steps: pool cost, area share, and occupancy.

## Problem

- Reconciliation is the reason the money features exist, and today it's done by hand once a year by editing formulas.
- Tenants can dispute their statement. The operator needs to show where every number came from.
- After reconciling, estimates for next year have to be updated on every lease, which is easy to forget for one of them.
- Nothing stops someone from recategorizing last year's transactions after statements went out, which silently changes what the statements should have said.

## Goals

- A year can be reconciled in one sitting once its transactions are categorized.
- Every number on a statement links back to the transactions and ledger entries behind it.
- Finalizing is one action that posts, locks, saves statements, and leads straight into next year's estimates.
- A finalized year can't drift. Changes require an explicit, recorded reopen.

## Non-goals

- Per-lease special terms: exclusions, caps, admin fees, gross-up, base years, fixed shares. None of the current leases have them.
- Splitting a year into periods with different pool settings.
- Fiscal years other than the calendar year.
- Accrual accounting. Totals are cash basis, with manual adjustment lines for timing differences.
- Tenant-facing dispute workflow.
- Reconciling costs that aren't shared through cost pools.

## Users and permissions

| Action | Staff | Admin |
|---|---|---|
| Open the workspace and see all numbers | yes | yes |
| Start a reconciliation | yes | yes |
| Add pool adjustments and lease adjustments | yes | yes |
| Edit the year's pool settings | no | yes |
| Finalize | no | yes |
| Set next year's estimates after finalizing | no | yes |
| Send statements | yes | yes |
| Reopen a finalized year | no | yes |

Finalize and reopen bill every tenant and lock or unlock a year, so they're admin only. Year pool settings change every tenant's share, so admin only too.

## Glossary

- **Reconciliation.** One property's reconciliation for one calendar year. Status `draft` or `finalized`.
- **Pool cost.** A cost pool's total for the year: category line totals from 05, plus manual pool adjustments.
- **Pool adjustment.** A manual line added to a pool's cost with a reason, for example a tax bill for this year paid in January of the next.
- **Year pool settings.** The units in each pool and their areas, used for this year. Copied from current settings when the reconciliation starts.
- **Step.** One operation in the per-lease calculation. Takes an amount and returns a new one with an explanation.
- **Lease result.** For one lease and one pool: the steps, the lease's actual share, estimates billed, and balance.
- **Lease adjustment.** A manual amount added to a lease's result for one pool, with a note that prints on the statement.
- **Year lock.** The state after finalizing that blocks changes to the data the reconciliation used.
- **Statement.** The document each tenant receives showing their reconciliation.

## User stories

- As an operator, in January I start the 2026 reconciliation and see a checklist of what's still uncategorized or unmatched.
- As an operator, I expand CAM and see every transaction that makes up its total, and fix one that was miscategorized.
- As an operator, I add a pool adjustment for a December tax bill that cleared on January 3.
- As an admin, I fix the water pool for 2026 because a unit joined the meter mid-year, without changing next year's settings.
- As an operator, I open one lease's statement and see area, share, days occupied, actual, billed, and balance for each pool.
- As an operator, I add a $40 courtesy credit to one lease's CAM with a note.
- As an admin, I finalize, and every lease gets its reconciliation charge or credit and a statement PDF.
- As an operator, I accept the suggested 2027 estimates for every lease in one screen, and the next charge run uses them.
- As an operator, I email each tenant their statement.
- As an admin, I reopen 2026 because a missed invoice turned up, fix it, and finalize again. The ledger shows the original, its reversal, and the new result.

## Flow

```text
 Start            Gather              Review              Finalize            Estimates
 -----            ------              ------              --------            ---------
 pick year   ->   checklist      ->   statement per  ->   post per lease ->   suggest next
 copy pool        pool costs          lease, live         lock the year       year's estimate
 settings         adjustments         lease adjustments   save PDFs           per lease/pool,
                  year settings                                               accept or edit
```

### Start

`/reconciliation` lists years from the property's first charge run to last year, each with status: not started, draft, finalized (with date and who). "Start" on a year creates a draft and copies the current pool settings and unit areas into year pool settings.

Starting the current year is allowed (for a mid-year check) but finalizing it is blocked until the year has ended.

### Gather

`/reconciliation/2026`. The top of the page is a checklist. Finalize stays disabled until every item passes:

| Check | Passes when | Link |
|---|---|---|
| Spending categorized | No money-out transaction dated in the year needs review | Inbox filtered to the year |
| Deposits handled | No money-in transaction dated in the year needs review | Inbox filtered to the year |
| Charges posted | Every month of the year in which a lease with a recovery was active has a charge run | Rent roll |
| Pools have units | Every pool with a recovery in the year has participating units | Year pool settings |
| Leases in pools | Every lease with a recovery has its unit in that pool's year settings | Lease list below |

Below it, one card per cost pool:

```text
CAM                                                      $12,891.19
  Transactions (37)                                      $12,891.19   [show]
  Adjustments                                                 $0.00   [add]
  Units: 6, 9,350 sqft                                                [year settings]
```

- **Show** expands the transaction list (date, account, description, amount, category line note) with links to recategorize. Changes elsewhere update the card on refresh.
- **Add adjustment**: amount (positive or negative), reason, optional attachment. Listed under the card with who added it.

### Year pool settings

An admin-only panel per pool with the same editor as 01 (the pool's units) plus unit areas, all scoped to this year. Changes here never touch current Settings. A "Reset to current settings" action copies the current values again. The panel shows a note when year settings differ from current ones.

When a pool changes mid-year, the admin decides which configuration applies to the whole year.

### Review

Below the pools, a table of every lease with at least one recovery overlapping the year, including leases that ended during the year:

```text
Lease               CAM        Tax        Insurance   Water      Net
4712 Concord        +$223.52   -$362.79   +$377.01    -          +$237.74
4704 Boss Baby      +$260.20   +$5.13     +$631.45    -$157.46   +$739.32
...
Total                                                            +$1,277.10
Owner share and rounding                                          [details]
```

Positive means the tenant owes. Clicking a lease opens its statement preview at `/reconciliation/2026/leases/[leaseId]`:

- Tenant legal name (or display name), mailing address, unit, year.
- Per pool: pool cost, the lease's steps with their explanations, actual share, estimates billed (linking to the ledger entries), adjustments, balance.
- Net amount due or credited.
- Lease adjustments: "Add adjustment" per pool with amount and a note that prints on the statement.
- The statement re-renders as data changes. Nothing touches the ledger until finalize.

An "Owner share and rounding" panel per pool shows the pool cost, the sum of tenant shares, the share of pool units with no lease or no recovery on the pool, and the rounding remainder. This answers "why don't the tenant shares add up to the total" before anyone asks.

### Finalize

Admin clicks Finalize. A confirm dialog shows: number of leases, total billed, total credited, statement date (default today, editable), and that the year will be locked.

In one database transaction:

1. Compute every lease result and store them, including each step's input, output, and explanation.
2. For each lease and pool with a non-zero balance (after lease adjustments), post a `reconciliation` ledger entry (04) with `poolId`, `reconciliationId`, `entryDate` = statement date, and a description like "2026 CAM reconciliation".
3. Lock the year (below).
4. Mark the reconciliation `finalized` with who and when.

After the transaction commits, statement PDFs are generated and saved as `statement` documents (03) linked to each lease, through `RecordSystemDocument`. If PDF generation fails for any lease, the reconciliation stays finalized and the workspace shows a "Regenerate statements" action. Documents are derived output; the ledger entries are the record.

### Estimates for next year

Right after finalizing, the workspace opens `/reconciliation/2026/estimates`:

```text
Lease            Pool        2026 actual (12 mo)   Current est.   Suggested   New est.
4712 Concord     CAM         $3,446.84             $268.61        $287.24     [ 287.24 ]  [x]
4712 Concord     Tax         $8,968.53             $777.61        $747.38     [ 747.38 ]  [x]
...
Effective date: [ Jan 1, 2027 ]          [ Apply selected ]
```

- **Suggested** is `pool cost × share ÷ 12`, without the occupancy factor, so a lease that started mid-year gets a full-year estimate. Rounded to the cent.
- Leases that ended, or end before the effective date, are left out.
- Each row can be edited or unchecked.
- **Effective date** defaults to January 1 of the next year. If that month is already charged, the screen shows the catch-up total from 04 and offers "Post catch-up charges" as one checkbox for the whole batch.
- **Apply selected** calls 02's `SetEstimate` for each checked row in one transaction, with catch-ups when chosen.

The step can be left and come back to from the reconciliation page until every row is applied or dismissed.

### Statements

From the finalized workspace:

- Download one statement, or all as a zip.
- Send by email to each tenant's primary contact (02), once an email provider exists (README open question). Records `sentAt` and the address per statement.
- Optional "Include expense detail" setting per reconciliation adds an appendix listing each pool's transactions by date, description, and amount. Some tenants ask for this; some operators prefer not to share it, so it's off by default.

### Reopen

Admin only, from a finalized year, with a required reason.

In one transaction:

1. Post a `reversal` for every `reconciliation` entry this reconciliation created.
2. Unlock the year.
3. Set status back to `draft`, keeping adjustments and year pool settings.

Previous statement documents stay. When the year is finalized again, the new statements supersede them (03). Estimates already applied to leases stay as they are; the estimates step appears again with new suggestions.

## Year lock

After finalize, for that property and year:

| Blocked | Context |
|---|---|
| Changing or removing existing category lines on transactions dated in the year | 05 |
| Adding a `recoverable` category line to a transaction dated in the year | 05 |
| Undoing imports containing transactions dated in the year | 05 |
| Unmatching deposits dated in the year | 05 |
| Posting `estimate` entries (any source, including catch-ups and reversals) with a period in the year | 04 |
| Posting charge runs for months in the year | 04 |

Not blocked: payments, fees, credits, and refunds dated in the year, importing new transactions dated in the year, and categorizing those new transactions into any non-recoverable category or matching them to payments. None of that changes the reconciliation's numbers.

A new spending transaction that belongs in a pool can't be added to a locked year. The category picker disables recoverable categories with a note: "2026 is reconciled. Reopen it, or add this as a pool adjustment in 2027." Choosing the second option categorizes the transaction as `excluded` with a note and creates a draft pool adjustment on next year's reconciliation, starting that reconciliation if needed. The transaction leaves the inbox either way.

The lock is exposed as `isYearLocked(propertyId, year)` from the Billing context and called by 04 and 05 command handlers.

## The calculation

### v1 formula

For each lease with a recovery on a pool, for the year:

```text
pool cost  = category line total for the pool's category, dated in the year (05)
             + pool adjustments
share      = unit sqft / total sqft of the pool's units   (from year pool settings)
occupancy  = days the recovery was active in the year / days in the year
actual     = pool cost x share x occupancy
billed     = sum of estimate entries for the lease and pool with a period in the year (04)
balance    = round(actual) - billed + lease adjustments
```

"Recovery active" is the overlap of the lease dates, the recovery's own start and end dates (02), and the year. Days in the year is 365 or 366.

Intermediate values use a decimal type with at least 20 significant digits (for example `decimal.js`). Only `actual` is rounded, to the cent, half away from zero. Shares are never rounded before use.

### Steps

The calculation records each step for each lease and pool: its kind, input, output, and a one-line explanation. Statements print these lines, so a tenant sees how their number was reached.

| Order | Step | Explanation example |
|---|---|---|
| 1 | `pool_cost` | "CAM cost for 2026: $12,891.19" |
| 2 | `share` | "Your area 2,500 sqft of 9,350 sqft = 26.738%" |
| 3 | `occupancy` | "Occupied 365 of 365 days" |

## Dashboard

"2026 not reconciled" appears from February 1 until that year is finalized, for properties with any recovery in the year. It links to the workspace or the Start action.

## Domain model

In the Billing context.

### Reconciliation (aggregate)

Fields: `id`, `propertyId`, `year`, `status`, `yearPoolSettings`, `poolAdjustments`, `leaseAdjustments`, `statementDate`, `includeExpenseDetail`, `finalizedAt`, `finalizedBy`, `version`.

Invariants:

1. One reconciliation per property and year.
2. Finalize only when the year has ended and the checklist passes.
3. Adjustments and year settings change only while `draft`.
4. Reopen only while `finalized`.

| Command | Access | Event |
|---|---|---|
| `StartReconciliation(year)` | operate | `ReconciliationStarted` |
| `SetYearPoolSettings(poolId, settings)` | admin | `YearPoolSettingsSet` |
| `ResetYearPoolSettings(poolId)` | admin | `YearPoolSettingsSet` |
| `AddPoolAdjustment(poolId, amount, reason)` | operate | `PoolAdjustmentAdded` |
| `RemovePoolAdjustment(id)` | operate | `PoolAdjustmentRemoved` |
| `AddLeaseAdjustment(leaseId, poolId, amount, note)` | operate | `LeaseAdjustmentAdded` |
| `RemoveLeaseAdjustment(id)` | operate | `LeaseAdjustmentRemoved` |
| `Finalize(statementDate)` | admin | `ReconciliationFinalized` |
| `Reopen(reason)` | admin | `ReconciliationReopened` |
| `MarkStatementSent(leaseId, address)` | operate | `StatementSent` |

### Calculation (domain service)

`calculateReconciliation(inputs) -> LeaseResult[]` is pure. Inputs are pool costs and lines, year pool settings, leases with recoveries and dates, estimates billed per lease and pool, and adjustments. The application service gathers inputs from 02, 04, and 05 through query ports. The same function runs for the live preview and at finalize.

### YearLock (part of Reconciliation)

`isYearLocked(propertyId, year)` returns true when a finalized reconciliation exists for that property and year.

## API

| Procedure | Kind | Access | Notes |
|---|---|---|---|
| `reconciliation.list` | query | operate | Years and status |
| `reconciliation.start` | mutation | operate | |
| `reconciliation.get` | query | operate | Checklist, pool cards, lease table |
| `reconciliation.poolLines` | query | operate | Transactions behind a pool |
| `reconciliation.setYearPoolSettings`, `.resetYearPoolSettings` | mutation | admin | |
| `reconciliation.addPoolAdjustment`, `.removePoolAdjustment` | mutation | operate | |
| `reconciliation.leaseStatement` | query | operate | Full statement for one lease, live or stored |
| `reconciliation.addLeaseAdjustment`, `.removeLeaseAdjustment` | mutation | operate | |
| `reconciliation.finalize` | mutation | admin | Input `{ id, statementDate, version }` |
| `reconciliation.regenerateStatements` | mutation | operate | |
| `reconciliation.estimateSuggestions` | query | operate | |
| `reconciliation.applyEstimates` | mutation | admin | Input rows, effective date, `postCatchUp` |
| `reconciliation.downloadStatements` | query | operate | Signed URL to a zip |
| `reconciliation.sendStatements` | mutation | operate | Once email exists |
| `reconciliation.reopen` | mutation | admin | Input `{ id, reason }` |

## PDF rendering

Statements need server-side PDFs. Add `packages/infrastructure/pdf` with one render function per document, built on `@react-pdf/renderer` so layouts are React components that share styles. 04's statement of account moves onto it too. Rendering runs in the API route, not in a separate worker, since a property has a handful of leases. If that changes, generation is already a separate step after the finalize transaction.

## Data model

```text
billing.reconciliations
  id, property_id, year, status, statement_date, include_expense_detail,
  finalized_at, finalized_by, version, created_at, updated_at
  unique (property_id, year)

billing.reconciliation_pool_settings
  reconciliation_id (fk cascade), pool_id,
  participating_unit_ids uuid[]
  unit_sqft jsonb                      -- { unitId: sqft } for the pool's units
  primary key (reconciliation_id, pool_id)

billing.reconciliation_pool_adjustments
  id, reconciliation_id (fk cascade), pool_id, amount_cents bigint, reason,
  storage_key, created_by, created_at

billing.reconciliation_lease_adjustments
  id, reconciliation_id (fk cascade), lease_id, pool_id, amount_cents bigint, note,
  created_by, created_at

billing.reconciliation_results              -- written at finalize
  reconciliation_id (fk cascade), lease_id, pool_id,
  pool_cost_cents bigint, actual_cents bigint, billed_cents bigint,
  adjustment_cents bigint, balance_cents bigint,
  steps jsonb not null,
  ledger_entry_id uuid,
  primary key (reconciliation_id, lease_id, pool_id)

billing.reconciliation_statements
  reconciliation_id (fk cascade), lease_id, document_id, sent_at, sent_to,
  primary key (reconciliation_id, lease_id, document_id)
```

Results are kept from every finalize, keyed by reconciliation. On reopen and re-finalize, the old rows are replaced and the old ledger entries are reversed, so the ledger keeps the history and the results table holds the current answer.

## Edge cases

- **Lease started mid-year.** Occupancy is partial. Suggested estimate for next year is a full-year amount.
- **Lease ended mid-year.** Included with partial occupancy. Its reconciliation entry posts to its ledger even though it's ended. Statement goes to the tenant's mailing address. Left out of the estimates step.
- **Vacant unit.** No lease, no result. Its share shows in the owner share panel.
- **Unit not in the pool's year settings but its lease has a recovery.** Fails the checklist. The admin either adds the unit to the year's pool or the operator ends the recovery.
- **Two leases on one unit in the same year** (one ended, the next started). Each gets its own occupancy, so together they cover the unit once.
- **Pool cost is negative** (refunds exceeded costs). Calculated as usual. Every lease gets a credit.
- **Billed is zero** (lease had a recovery but no estimate charges). Balance is the full actual. The review table flags it.
- **Catch-up for an estimate in a locked year.** Blocked by the lock. The operator reopens, or handles it as a lease adjustment.
- **Transaction arrives after finalize, dated in the year.** Read-only in the inbox. Reopen, or add it as a pool adjustment next year.
- **Year pool settings differ from current settings.** The workspace shows a note so nobody is surprised.

## Acceptance criteria

1. Finalize is disabled until every checklist item passes and the year has ended.
2. Each pool's cost equals the sum of its category lines dated in the year plus its adjustments, and the transaction list behind it adds up to the transaction part.
3. For a lease with 2,500 sqft in a 9,350 sqft pool, occupied all year, with a $12,891.19 pool cost and $3,223.32 billed, the balance is $223.52.
4. A lease active for 182 of 365 days gets 182/365 of its full-year share.
5. Editing year pool settings changes this year's results and leaves current Settings unchanged.
6. Finalizing posts one `reconciliation` entry per lease and pool with a non-zero balance, stores results with steps, locks the year, and saves one statement document per lease.
7. After finalizing, recategorizing a transaction dated in the year, posting an estimate for a period in the year, and unmatching a deposit in the year are all rejected.
8. Applying estimates updates each selected lease's recovery from the effective date, and offers catch-up when that month is already charged.
9. Reopening reverses every reconciliation entry, unlocks the year, and keeps adjustments. Finalizing again produces new statements that supersede the old ones.
10. Statement PDFs list every step with its explanation for each pool.

## Open questions

1. What payment terms should statements state ("due within 30 days")? A per-property statement footer setting would cover it.
2. Should credits be refunded automatically, or left on the ledger to offset future rent? v1 leaves them on the ledger.
3. Should the expense detail appendix be on by default?
