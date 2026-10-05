# 06. Year-end reconciliation

Depends on: 01 (cost pools), 02 (recoveries), 03 (statements saved as documents), 04 (estimates billed, reconciliation entries), 05 (actual costs). Completes the set.

## Summary

Once a year, for each property, the operator adds up what each shared cost actually was, works out each lease's share, compares it with the estimates the lease was billed, and bills or credits the difference. The portal does this in a workspace: a checklist that makes sure the year's data is complete, cost totals that link to their transactions, a live statement for every lease, and a finalize step that posts the results, locks the year, saves statement PDFs, and sets next year's estimates.

The calculation has three steps: pool cost, area share by month, and a yearly share weighted by the days the lease was active.

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
- Fiscal years other than the calendar year.
- Accrual accounting. Totals are cash basis, with manual adjustment lines for timing differences.
- Tenant-facing dispute workflow.
- Reconciling costs that aren't shared through cost pools.

## Users and permissions

Staff and admins can do everything in this PRD (see Permissions in the README).

## Glossary

- **Reconciliation.** One property's reconciliation for one calendar year. Its status is draft or finalized.
- **Pool cost.** A cost pool's total for the year: category line totals from 05, plus manual pool adjustments.
- **Pool adjustment.** A manual line added to a pool's cost with a reason, for example a tax bill for this year paid in January of the next.
- **Year pool settings.** For each month of the year, the units in each pool and their areas. Built from the unit area history and pool membership history in Settings (01) when the reconciliation starts.
- **Step.** One operation in the per-lease calculation. Takes an amount and returns a new one with an explanation.
- **Lease result.** For one lease and one pool: the steps, the lease's actual share, estimates billed, and balance.
- **Lease adjustment.** A manual amount added to a lease's result for one pool, with a note that prints on the statement.
- **Year lock.** The state after finalizing that blocks changes to the data the reconciliation used.
- **Statement.** The document each tenant receives showing their reconciliation.

## User stories

- As an operator, in January I start the 2026 reconciliation and see a checklist of what's still uncategorized or unmatched.
- As an operator, I expand CAM and see every transaction that makes up its total, and fix one that was miscategorized.
- As an operator, I add a pool adjustment for a December tax bill that cleared on January 3.
- As an operator, I see that a unit joined the water meter in July 2026, so its water share starts in July. If the date in Settings was wrong, I fix the months in the year's settings without changing Settings.
- As an operator, I open one lease's statement and see area, share, days occupied, actual, billed, and balance for each pool.
- As an operator, I add a $40 courtesy credit to one lease's CAM with a note.
- As an operator, I finalize, and every lease gets its reconciliation charge or credit and a statement PDF.
- As an operator, I accept the suggested 2027 estimates for every lease in one screen, and the next charge run uses them.
- As an operator, I email each tenant their statement.
- As an operator, I reopen 2026 because a missed invoice turned up, fix it, and finalize again. The ledger shows the original, its reversal, and the new result.

## Flow

```text
 Start            Gather              Review              Finalize            Estimates
 -----            ------              ------              --------            ---------
 pick year   ->   checklist      ->   statement per  ->   post per lease ->   suggest next
 build pool       pool costs          lease, live         lock the year       year's estimate
 settings by      adjustments         lease adjustments   save PDFs           per lease/pool,
 month            year settings                                               accept or edit
```

### Start

The Reconciliation page lists years from the property's first charge run to last year, each with status: not started, draft, finalized (with date and who). "Start" on a year creates a draft and builds year pool settings for each month: the units in each pool that month and their area in effect that month. A property has one reconciliation per year.

Starting the current year is allowed (for a mid-year check) but finalizing it is blocked until the year has ended.

### Gather

Each year has its own workspace page. The top of the page is a checklist. Finalize stays disabled until every item passes:

| Check | Passes when | Link |
|---|---|---|
| Spending categorized | No money-out transaction dated in the year needs review | Inbox filtered to the year |
| Deposits handled | No money-in transaction dated in the year needs review | Inbox filtered to the year |
| Charges posted | Every month of the year in which a lease with a recovery was active has a charge run | Rent roll |
| Pools have units | Every pool has units in every month a recovery on it was active | Year pool settings |
| Leases in pools | Every lease's unit is in the pool's year settings for every month its recovery was active | Lease list below |

Below it, one card per cost pool:

```text
CAM                                                      $12,891.19
  Transactions (37)                                      $12,891.19   [show]
  Adjustments                                                 $0.00   [add]
  Units: 6, 9,350 sqft in December (changed in July)                  [year settings]
```

- **Show** expands the transaction list (date, account, description, amount, category line note) with links to recategorize. Changes elsewhere update the card on refresh.
- **Add adjustment**: amount (positive or negative), reason, optional attachment. Listed under the card with who added it.

### Year pool settings

A panel per pool. It shows a grid with one row per unit and one column per month. Each cell shows the unit's area that month, or is blank when the unit isn't in the pool that month.

```text
Water 2026     Jan    Feb   ...   Jun    Jul    ...   Dec
4704           2,910  2,910       2,910  2,910        2,910
4708 #101        850    850         850    850          850
4708 #102          -      -           -    590          590
Total          3,760  3,760       3,760  4,350        4,350
```

- The operator can add or remove a unit for a range of months, and change a unit's area for a range of months.
- Changes here only affect this year's reconciliation. They never change Settings.
- "Reset to Settings" builds the grid from Settings again.
- The panel shows a note when the grid differs from Settings, and highlights the cells that differ.

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

Positive means the tenant owes. Clicking a lease opens its statement preview:

- Tenant legal name (or display name), mailing address, unit, year.
- Per pool: pool cost, the lease's steps with their explanations, actual share, estimates billed (linking to the ledger entries), adjustments, balance.
- Net amount due or credited.
- Lease adjustments: "Add adjustment" per pool with amount and a note that prints on the statement. The portal records who added each one.
- The statement re-renders as data changes. Nothing touches the ledger until finalize.
- The preview uses the same calculation as finalize, so its numbers match what gets posted. After finalizing, it shows the results saved at finalize.

An "Owner share and rounding" panel per pool shows the pool cost, the sum of tenant shares, the share of pool units with no lease or no recovery on the pool, and the rounding remainder. This answers "why don't the tenant shares add up to the total" before anyone asks.

### Finalize

The operator clicks Finalize. A confirm dialog shows: number of leases, total billed, total credited, statement date (default today, editable), and that the year will be locked.

Finalizing does the following steps together. If one fails, none of them happen.

1. Work out every lease result and save it, including each step's input, output, and explanation.
2. For each lease and pool with a non-zero balance (after lease adjustments), post a reconciliation entry (04) to the lease's ledger for that pool, dated the statement date, with a description like "2026 CAM reconciliation".
3. Lock the year (below).
4. Mark the reconciliation finalized, with who finalized it and when.

Once finalized, adjustments and year pool settings can't change until an operator reopens the year.

After that, the portal makes a statement PDF for each lease and saves it as a statement document (03) on the lease. If a statement fails for any lease, the reconciliation stays finalized and the workspace shows a "Regenerate statements" action. Statements are made from the results. The ledger entries are the record.

### Estimates for next year

Right after finalizing, the workspace opens the estimates step:

```text
Lease            Pool        2026 actual (12 mo)   Current est.   Suggested   New est.
4712 Concord     CAM         $3,446.84             $268.61        $287.24     [ 287.24 ]  [x]
4712 Concord     Tax         $8,968.53             $777.61        $747.38     [ 747.38 ]  [x]
...
Effective date: [ Jan 1, 2027 ]          [ Apply selected ]
```

- **Suggested** is the pool cost times the lease's share in December, divided by 12. December is used because it matches the setup going into next year. It leaves out occupancy, so a lease that started mid-year gets a full-year estimate. It's rounded to the cent.
- Leases that ended, or end before the effective date, are left out.
- Each row can be edited or unchecked.
- **Effective date** defaults to January 1 of the next year. If that month is already charged, the screen shows the catch-up total from 04 and offers "Post catch-up charges" as one checkbox for the whole batch.
- **Apply selected** sets the new estimate on each checked row's recovery (02) from the effective date, and posts catch-ups when chosen. All checked rows apply together, or none do.

The step can be left and come back to from the reconciliation page until every row is applied or dismissed.

### Statements

From the finalized workspace:

- Download one statement, or all as a zip.
- Send by email to each tenant's primary contact (02), once an email provider exists (README open question). The portal records when each statement was sent and to which address.
- Optional "Include expense detail" setting per reconciliation adds an appendix listing each pool's transactions by date, description, and amount. Some tenants ask for this; some operators prefer not to share it, so it's off by default.

### Reopen

From a finalized year, with a required reason.

Reopening does the following steps together. If one fails, none of them happen.

1. Post a reversal for every reconciliation entry this reconciliation created.
2. Unlock the year.
3. Set status back to draft, keeping adjustments and year pool settings.

Finalizing again replaces the saved results. The ledger keeps the original entries, their reversals, and the new entries. Previous statement documents stay. When the year is finalized again, the new statements supersede them (03). Estimates already applied to leases stay as they are; the estimates step appears again with new suggestions.

## Year lock

Anything that would change a reconciled number is locked. Everything else stays open. After finalize, for that property and year:

| Blocked | PRD |
|---|---|
| Changing or removing existing category lines on transactions dated in the year | 05 |
| Adding a recoverable category line to a transaction dated in the year | 05 |
| Undoing imports containing transactions dated in the year | 05 |
| Unmatching deposits dated in the year | 05 |
| Posting estimate entries (any source, including catch-ups and reversals) with a period in the year | 04 |
| Posting charge runs for months in the year | 04 |

Not blocked: notes and receipts on transactions, payments, fees, credits, and refunds dated in the year, importing new transactions dated in the year, and categorizing those new transactions into any non-recoverable category or matching them to payments. None of that changes the reconciliation's numbers.

A new spending transaction that belongs in a pool can't be added to a locked year. The category picker disables recoverable categories with a note: "2026 is reconciled. Reopen it, or add this as a pool adjustment in 2027." Choosing the second option categorizes the transaction under an excluded category with a note and creates a draft pool adjustment on next year's reconciliation, starting that reconciliation if needed. The transaction leaves the inbox either way.

## The calculation

### v1 formula

For each lease with a recovery on a pool, for the year:

```text
pool cost      = category line total for the pool's category, dated in the year (05)
                 + pool adjustments
monthly share  = unit sqft that month / total sqft of the pool's units that month
                 (from year pool settings)
yearly share   = sum over the months of (monthly share x days the recovery was active that month)
                 / days in the year
actual         = pool cost x yearly share
billed         = sum of estimate entries for the lease and pool with a period in the year (04)
balance        = actual rounded to the cent - billed + lease adjustments
```

"Recovery active" is the overlap of the lease dates, the recovery's own start and end dates (02), and the year. Days in the year is 365 or 366.

The whole year's pool cost is split by the yearly share. Costs aren't split month by month, because some bills, like real estate tax, are paid once a year and belong to every month.

When a unit's area and pool stay the same all year, the yearly share is its area share times the fraction of the year it was occupied.

The calculation keeps full precision until the end. Only the actual amount is rounded, to the cent, with halves rounded away from zero. Shares are never rounded before use.

### Steps

The calculation records each step for each lease and pool: its kind, input, output, and a one-line explanation. Statements print these lines, so a tenant sees how their number was reached.

| Order | Step | Explanation example |
|---|---|---|
| 1 | Pool cost | "CAM cost for 2026: $12,891.19" |
| 2 | Share by month | "Jan to Dec: your area 2,500 sqft of 9,350 sqft = 26.738%". One line for each stretch of months with the same share |
| 3 | Yearly share | "Occupied 365 of 365 days. Yearly share 26.738%" |

## Dashboard

"2026 not reconciled" appears from February 1 until that year is finalized, for properties with any recovery in the year. It links to the workspace or the Start action.

## Edge cases

- **Lease started mid-year.** Occupancy is partial. Suggested estimate for next year is a full-year amount.
- **Lease ended mid-year.** Included with partial occupancy. Its reconciliation entry posts to its ledger even though it's ended. Statement goes to the tenant's mailing address. Left out of the estimates step.
- **Vacant unit.** No lease, no result. Its share shows in the owner share panel.
- **A unit's area changes mid-year.** Months before the change use the old area and months after use the new one. The statement shows one share line for each stretch.
- **A unit joins a pool mid-year.** It counts toward the pool's total only from the month it joined, so other units' shares drop from that month.
- **Two suites are combined mid-year.** The old units count through the last month chosen when they were archived, and the combined unit counts from its first month (01).
- **Pool archived mid-year.** Its category was archived in Settings (01). The pool still shows in that year's reconciliation, and its costs are reconciled as usual.
- **Unit not in the pool's year settings for a month its lease's recovery was active.** Fails the checklist. The operator either adds the unit to the year's pool or ends the recovery.
- **Two leases on one unit in the same year** (one ended, the next started). Each gets its own occupancy, so together they cover the unit once.
- **Pool cost is negative** (refunds exceeded costs). Calculated as usual. Every lease gets a credit.
- **Billed is zero** (lease had a recovery but no estimate charges). Balance is the full actual. The review table flags it.
- **Catch-up for an estimate in a locked year.** Blocked by the lock. The operator reopens, or handles it as a lease adjustment.
- **Transaction arrives after finalize, dated in the year.** Read-only in the inbox. Reopen, or add it as a pool adjustment next year.
- **Year pool settings differ from Settings.** The workspace shows a note so nobody is surprised.

## Acceptance criteria

1. Finalize is disabled until every checklist item passes and the year has ended.
2. Each pool's cost equals the sum of its category lines dated in the year plus its adjustments, and the transaction list behind it adds up to the transaction part.
3. For a lease with 2,500 sqft in a 9,350 sqft pool, occupied all year, with a $12,891.19 pool cost and $3,223.32 billed, the balance is $223.52.
4. A lease active for 182 of 365 days, with no change to its unit's area or pool, gets 182/365 of its full-year share.
5. In a 2026 pool costing $12,000, a unit with 1,000 of 10,000 sqft from January to June and 1,200 of 10,200 sqft from July to December, occupied all year, has an actual of $1,306.75.
6. Editing year pool settings changes this year's results and leaves current Settings unchanged.
7. Finalizing posts one reconciliation entry per lease and pool with a non-zero balance, stores results with steps, locks the year, and saves one statement document per lease.
8. After finalizing, recategorizing a transaction dated in the year, posting an estimate for a period in the year, and unmatching a deposit in the year are all rejected.
9. Applying estimates updates each selected lease's recovery from the effective date, and offers catch-up when that month is already charged.
10. Reopening reverses every reconciliation entry, unlocks the year, and keeps adjustments. Finalizing again produces new statements that supersede the old ones.
11. Statement PDFs list every step with its explanation for each pool.

## Open questions

1. What payment terms should statements state ("due within 30 days")? A per-property statement footer setting would cover it.
2. Should credits be refunded automatically, or left on the ledger to offset future rent? v1 leaves them on the ledger.
3. Should the expense detail appendix be on by default?
