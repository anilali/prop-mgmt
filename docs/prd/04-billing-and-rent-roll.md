# 04. Billing and rent roll

Depends on: 01 (categories, cost pools), 02 (lease terms). Used by: 05 (payments from deposits), 06 (estimates billed, reconciliation charges).

## Summary

Give every lease a ledger. Each month, the operator previews and posts charges generated from lease terms: base rent, shared-cost estimates, and flat charges. Payments, fees, credits, and corrections are recorded on the same ledger, and the balance is their sum. A rent roll grid shows a year of charges, payments, and balances for every lease on the property.

## Problem

- The portal knows what a lease says but not what a tenant has been charged, paid, or owes.
- Without charges per cost pool, reconciliation (06) can't know how much each tenant paid in estimates.
- Corrections in a spreadsheet overwrite history. A tenant disputing a balance needs to see every entry that produced it.

## Goals

- Posting a month's charges for the whole property takes one review and one click.
- A lease's balance on any date can be explained line by line.
- Posted entries never change. Every correction is visible.
- Charges for shared-cost estimates are tagged with their cost pool, so 06 can total them exactly.
- The rent roll replaces any outside spreadsheet for "who owes what".

## Non-goals

- Tenants paying online.
- Applying payments to specific charges. v1 is balance-forward. Aging is computed for display only.
- Automatic late fees.
- Security deposit accounting. The deposit amount stays on the lease (02) and is not a ledger entry.
- Invoices sent to tenants. A statement of account is available; monthly invoices are not.
- Scheduled charge runs.

## Users and permissions

Staff and admins can do everything in this PRD (see Permissions in the README). Nobody reverses a reconciliation entry directly. It's undone only by reopening the year in 06.

## Glossary

- **Ledger entry.** One line on a lease's ledger. Has a kind, an amount, an accounting date, and optionally a period.
- **Amount sign.** Positive entries increase what the tenant owes (charges). Negative entries decrease it (payments, credits).
- **Period.** The month a charge is for.
- **Line.** One generated charge for one lease term in one month.
- **Charge run.** One month's generated charges for a property, posted as a batch.
- **Reversal.** An entry for the opposite amount of another entry, linked to it. Undoes an entry without deleting it.
- **Catch-up.** Charges for months already charged, after a lease term changed retroactively (02).
- **Balance.** The sum of all entries on a lease up to a date.
- **Aging.** A display-only split of a positive balance by how old the unpaid charges are. Payments and credits pay the oldest charges first, and what's left is grouped by days since each charge's date. A reversal cancels the entry it reverses before aging is worked out.

## User stories

- As an operator, on the first of the month I see "June charges not posted", preview every lease's charges, skip one lease that's in a dispute, and post the rest.
- As an operator, I add a $50 late fee to one lease.
- As an operator, I record a check payment for a tenant.
- As an operator, I find that a charge was wrong, reverse it with a reason, and post the right one. Both the mistake and the fix stay visible.
- As an operator, I enter a lease's balance from before we started using the portal as one opening balance.
- As an operator, I look at the rent roll for 2026 and click any month for any lease to see exactly what was charged and paid.
- As an operator, I print a statement of account for a tenant who disputes their balance.
- As an operator, I see which leases have a balance older than 30 days.

## Ledger entries

### Kinds

| Kind | Sign | Has period | Created by |
|---|---|---|---|
| Base rent | + | yes | charge run, catch-up |
| Estimate | + | yes | charge run, catch-up. Tagged with its cost pool |
| Flat charge | + | yes | charge run, catch-up |
| Fee | + | optional | manual |
| Credit | − | optional | manual. Concession or goodwill credit |
| Payment | − | no | manual, or deposit match (05) |
| Refund | + | no | manual. Money returned to a tenant with a credit balance |
| Opening balance | ± | no | manual, once per lease |
| Reconciliation | ± | no | 06 only. Tagged with its cost pool and its reconciliation |
| Reversal | opposite of the entry it reverses | same as that entry | manual, or 06 reopen |

A reversal has the same period and cost pool as the entry it reverses, so totals per pool and per period stay correct after a correction.

A payment created by matching a bank deposit (05) stays linked to that transaction. 05 keeps the full list of which transactions paid which payments, including manual payments matched later.

### Rules

1. Posted entries are never changed or deleted. The only exception is a payment created by a bank match, which is removed when it's unmatched in 05, and only while its year is not locked by 06.
2. An entry can be reversed at most once. A reversal can't be reversed. To redo, post a new entry. Reconciliation entries can only be reversed by reopening the reconciliation in 06.
3. A lease has at most one opening balance, and it must be dated before every other entry on the lease.
4. Estimate and reconciliation entries are tagged with a cost pool. Other kinds aren't, except reversals of those two.
5. In a year locked by 06, no estimate entry can have a period in that year, including catch-ups and reversals, and no charge run can be posted for its months. Payments, fees, credits, and refunds are still allowed. See "Year lock" in 06.
6. Ended leases still accept entries: final payments, refunds, and 06's reconciliation entries all land after a lease ends.
7. A charge run charges each line at most once per lease and period.

## Generating charges

### Lines

Each generated charge comes from one lease term:

- A rent step.
- A recovery estimate, as of its effective date.
- A flat charge.

A rent step or estimate that changes mid-month produces two lines in that month, one for each part of the month.

### Amount for one line in one period

With prorate on:

- If the lease is active and the term is in effect for the whole month, the line is the full monthly amount.
- Otherwise the line is the monthly amount times the days the lease is active and the term is in effect, divided by the days in the month, rounded to the nearest cent.

With prorate off:

- If the term is in effect on the first day of the month the lease is active, the line is the full monthly amount.
- Otherwise the line is zero.

With prorate off, a lease starting on the 15th pays its full first month, and a step that starts mid-month takes effect the next month.

"Lease active" means between start date and end date inclusive. A month-to-month lease (still active past its end date) is treated as active for the whole period, using the terms in effect on its end date. Lines follow the same monthly breakdown of lease terms that 02 shows.

### Charge run flow

The rent roll and dashboard show "June charges not posted" from the first of the month until the run is posted. An operator can also start a run for next month up to 10 days before it begins. Each property has one charge run per month.

1. **Preview.** One row per lease that would be charged, expandable to show each line with its amount, proration days, and description. Totals at the bottom by kind.
2. **Warnings**, shown inline and in a summary at the top:
   - Lease has no recoveries (may be intended).
   - Lease ends this month (final month prorated).
   - Lease is past its end date but still active (month to month). Charged at the last terms unless skipped.
   - Recovery's unit is no longer in its pool (02 edge case).
   - Pool has no participating units (01 edge case). Estimate lines for it are blocked.
   - Lease starts mid-month.
3. **Adjust.**
   - Skip a lease for this run, with a required reason.
   - Add a one-off charge to a lease (a fee or flat charge, with description).
4. **Post.** Every lease's charges post together with the run. If any line can't post, for example because it was already charged, nothing posts and the preview refreshes. After posting, the page becomes a read-only record of the run.

### After the run

- **"Post missing charges".** Shown on a posted run when an active lease has no charges from a charge run for that period. Typical cause: a lease created after the run, or a skipped lease now resolved. It previews and posts that lease's lines into the same run. A lease that was charged in the run is never "missing", even if its terms changed later. Differences from changed terms are only ever posted as catch-ups, so the two paths can't charge the same month twice.
- **Leases that become active for a past month** (a lease backdated to start three months ago) show missing charges on each of those months' runs. The lease's Ledger tab also shows a banner: "3 months not charged" with one action to post all of them.

### Catch-up

When a lease term changes in 02 with an effective date in a month already charged, billing works out catch-up charges. The operator sees them in 02's preview of the term change, and they post together with the change.

For each period from the effective month to the last charged month, and for each term the change affects, the catch-up compares:

- what the lease should be charged for that term under the new terms, and
- what it was already charged for that term in that period, counting charge runs, earlier catch-ups, and reversals.

Charges are compared by term, not by line, because a new estimate effective date starts a new line for the same recovery.

Each difference that isn't zero becomes one entry with the line's kind, period, and cost pool, and a description like "CAM estimate change effective Jan 1, 2026". One entry per period keeps per-year totals right for 06 when a catch-up crosses a year boundary.

## Manual entries

From the lease's Ledger tab:

- **Add charge.** A fee or flat charge, amount, date, optional period, description.
- **Add credit.** Amount, date, optional period, description.
- **Record payment.** Amount, received date, method (check, cash, bank deposit, other), reference such as a check number, memo. If 05 is live and the property has bank accounts, the form notes that deposits are usually matched from Transactions and links there.
- **Record refund.** Only when the balance is negative. Amount can't exceed the credit balance. Once 05 ships, refunds are usually created by matching the outgoing bank transaction instead.
- **Post opening balance.** Only when the lease has no opening balance. Amount (positive owed, negative credit), date (defaults to the day before the lease's first entry), memo.
- **Reverse.** On any entry that can be reversed. Requires a reason, which becomes the reversal's description. The original row shows "Reversed" with a link.

## Screens

### Lease Ledger tab

- Header: current balance, aging split (current, 1 to 30, 31 to 60, 61 to 90, over 90 days), last payment date and amount.
- Table: date, period, description, kind, charge, payment, running balance. Reversed entries and their reversals are shown with a strikethrough link between them. Filter by date range, kind, and pool.
- Actions: Add charge, Add credit, Record payment, Record refund, Post opening balance, Statement.
- **Statement of account.** Pick a date range. Opens a print-friendly page with property and tenant details, opening balance for the range, every entry, and closing balance. Download as PDF once 06 adds PDF downloads; until then, browser print.

### Rent roll

```text
                Opening   Jan          Feb          Mar      ...   Closing
4704 Boss Baby  $0.00     $3,652.74    $3,652.74    $3,702.74      $412.10
                          -$3,652.74   -$3,500.00   -$3,700.00
                          $0.00        $152.74      $155.48
4708 #101 ...
-----------------------------------------------------------------------------
Total           ...
```

- One row per lease with any entry in the year, plus active leases with none. Grouped by unit. Ended leases are shown muted.
- Each month cell shows charged, paid, and balance at month end. Cells where the month's charges aren't posted yet are dashed.
- Clicking a cell opens a side panel: the entries behind it, plus Record payment and Add charge for that lease.
- Rows with aging over 30 days are marked.
- Year picker. Export to CSV, one row per lease per month with the three numbers.
- A "Charge runs" link lists every run for the property with period, posted by, posted at, totals, and skipped leases with their reasons.

### Screen states

- **No active leases.** The rent roll explains that charges come from active leases and links to creating a lease.
- **Lease with no terms beyond base rent.** Charged base rent only. No warning unless the property has cost pools, in which case "No recoveries" appears in the preview as information.
- **Year with no entries.** The grid shows rows with empty cells and the opening balance.

## Dashboard cards

| Card | Condition |
|---|---|
| "{Month} charges not posted" | Today is on or after the 1st and the month has no charge run |
| "Balances over 30 days" | Count of leases with aging over 30 days greater than zero |
| "Months not charged" | Active leases with past periods missing charges from a charge run |

## Edge cases

- **Two operators post the same month.** The second post is rejected. They see the posted run.
- **Lease terms change between preview and post.** Posting works the charges out again from the current terms, not from the preview the operator saw. If the totals differ, nothing posts, the operator sees "Charges changed since preview", and the preview reloads.
- **Rent step on the 15th with prorate on.** Two base rent entries that month, each with its own day count in the description.
- **Lease ends on the 10th.** Final month prorated to 10 days. No charges after.
- **Lease ended early after the month was charged.** The operator reverses or credits the unused days by hand. The ledger tab shows a hint with the computed amount.
- **Payment larger than the balance.** Allowed. The balance goes negative and shows as a credit.
- **Opening balance entered after charges exist.** Allowed if dated before the first entry.
- **February with prorate.** Uses 28 or 29 days for that month.
- **Catch-up spanning December and January.** One entry per period, so each year gets its own share.

## Acceptance criteria

1. A charge run preview for a month shows, for every active lease, exactly the lines its terms imply (02), with proration by days when enabled.
2. Posting the same month twice is rejected.
3. A skipped lease is listed on the run with its reason, and "Post missing charges" later charges it without duplicating anyone else.
4. Every estimate entry is tagged with the cost pool of its recovery, including catch-ups and reversals.
5. Nothing edits or deletes a posted entry, except unmatching a payment in 05 before a year is locked.
6. Reversing an entry creates a linked opposite entry, and the original can't be reversed again.
7. A lease's balance equals the sum of its entries, and the rent roll month-end balances agree with the ledger.
8. Aging buckets add up to the positive balance.
9. A catch-up posted from 02 produces one entry per affected period with the right kind and pool.
10. The statement of account for a date range shows the opening balance, every entry, and the closing balance.

## Open questions

1. Should operators be able to post charges for a month further ahead than 10 days, for tenants who prepay?
2. Is balance-forward enough, or do you want payments applied to specific charges now? Applying later means going back and assigning existing payments to charges.
3. Should month-to-month leases default to being charged at the last terms, or skipped until someone decides?
