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
- Scheduled charge runs. The preview logic is built so a scheduler can call it later.

## Users and permissions

| Action | Staff | Admin |
|---|---|---|
| View ledgers and rent roll | yes | yes |
| Preview and post charge runs | yes | yes |
| Add one-off charges and credits | yes | yes |
| Record payments and refunds | yes | yes |
| Reverse an entry | yes | yes |
| Post opening balances | yes | yes |
| Reverse a reconciliation entry | no | no, only through reopening in 06 |

## Glossary

- **Ledger entry.** One line on a lease's ledger. Has a kind, an amount, an accounting date, and optionally a period.
- **Amount sign.** Positive entries increase what the tenant owes (charges). Negative entries decrease it (payments, credits).
- **Period.** The month a charge is for, stored as the first day of the month.
- **Line key.** Identifies which lease term produced a generated charge, so the same term isn't charged twice for the same month.
- **Charge run.** One month's generated charges for a property, posted as a batch.
- **Reversal.** An entry for the opposite amount of another entry, linked to it. Undoes an entry without deleting it.
- **Catch-up.** Charges for months already charged, after a lease term changed retroactively (02).
- **Balance.** The sum of all entries on a lease up to a date.
- **Aging.** A display-only split of a positive balance by how old the unpaid charges are, assuming payments pay the oldest charges first.

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
| `base_rent` | + | yes | charge run, catch-up |
| `estimate` | + | yes | charge run, catch-up. Carries `poolId` |
| `flat` | + | yes | charge run, catch-up |
| `fee` | + | optional | manual |
| `credit` | − | optional | manual. Concession or goodwill credit |
| `payment` | − | no | manual, or deposit match (05) |
| `refund` | + | no | manual. Money returned to a tenant with a credit balance |
| `opening_balance` | ± | no | manual, once per lease |
| `reconciliation` | ± | no | 06 only. Carries `poolId` and `reconciliationId` |
| `reversal` | opposite of target | same as target | manual, or 06 reopen |

A reversal copies the target's `poolId` and `period`, so totals per pool and per period stay correct after a correction.

### Fields

`id`, `propertyId`, `leaseId`, `kind`, `amountCents` (signed), `entryDate` (accounting date), `period` (optional), `poolId` (optional), `lineKey` (generated charges only), `description`, `source` (`charge_run`, `catch_up`, `manual`, `bank_match`, `reconciliation`), `chargeRunId`, `reconciliationId`, `bankTransactionId`, `paymentMethod`, `reference` (check number and similar), `reversesEntryId`, `memo`, `createdBy`, `createdAt`.

`bankTransactionId` is set only on entries created by a bank match and never updated. The full list of links between transactions and payments, including manual payments matched later, lives in Banking's `payment_links` (05).

### Invariants

1. Posted entries are never updated or deleted. The only exception is a `bank_match` payment removed by unmatching in 05, and only while its year is not locked by 06.
2. An entry can be reversed at most once. A reversal can't be reversed. To redo, post a new entry. `reconciliation` entries can only be reversed by reopening the reconciliation in 06.
3. A lease has at most one `opening_balance` entry, and it must be dated before every other entry on the lease.
4. `estimate` and `reconciliation` entries have a `poolId`. Other kinds don't, except reversals of those two.
5. In a year locked by 06, no `estimate` entry (of any source, including catch-ups and reversals) can have a period in that year, and no charge run can be posted for its months. Payments, fees, credits, and refunds are still allowed. See "Year lock" in 06.
6. Charges can't be posted to a `draft` lease. Ended leases still accept entries: final payments, refunds, and 06's reconciliation entries all land after a lease ends.
7. Generated charges (`source = charge_run`) are unique per lease, period, and line key. The database enforces it.

## Generating charges

### Line keys

| Term | Line key |
|---|---|
| Rent step | `rent:{stepEffectiveDate}` |
| Recovery estimate | `estimate:{recoveryId}:{estimateEffectiveDate}` |
| Flat charge | `flat:{flatChargeId}` |

A rent step or estimate that changes mid-month produces two line keys in that month, one per segment.

### Amount for one line in one period

```text
firstActiveDay = first day in the period the lease is active
segment        = days in the period where the lease is active and the term is in effect

prorate on:   amount = monthlyCents                                    if segment covers the whole month
                     = round(monthlyCents x segmentDays / daysInMonth) otherwise
prorate off:  amount = monthlyCents  if the term is in effect on firstActiveDay
                     = 0             otherwise
```

With prorate off, a lease starting on the 15th pays its full first month, and a step that starts mid-month takes effect the next month.

"Lease active" means between start date and end date inclusive. A month-to-month lease (status `active`, past its end date) is treated as active for the whole period, using the terms in effect on its end date. The function that produces lines for a lease and period lives in the Billing domain package and calls `monthlyBreakdown` segments from 02. It's pure and fully unit tested.

### Charge run flow

The rent roll and dashboard show "June charges not posted" from the first of the month until the run is posted. An operator can also start a run for next month up to 10 days before it begins.

1. **Preview.** `/rent-roll/runs/2026-06`. One row per lease that would be charged, expandable to show each line with its amount, proration days, and description. Totals at the bottom by kind.
2. **Warnings**, shown inline and in a summary at the top:
   - Lease has no recoveries (may be intended).
   - Lease ends this month (final month prorated).
   - Lease is past its end date but still active (month to month). Charged at the last terms unless skipped.
   - Recovery's unit is no longer in its pool (02 edge case).
   - Pool has no participating units (01 edge case). Estimate lines for it are blocked.
   - Lease starts mid-month.
3. **Adjust.**
   - Skip a lease for this run, with a required reason.
   - Add a one-off charge to a lease (kind `fee` or `flat`, with description).
4. **Post.** All entries are written in one transaction with the charge run record. The page becomes a read-only record of the run.

### After the run

- **"Post missing charges".** Shown on a posted run when an active lease has no `charge_run` entries at all for that period. Typical cause: a lease activated after the run, or a skipped lease now resolved. It previews and posts that lease's lines into the same run. A lease that was charged in the run is never "missing", even if its terms changed later. Differences from changed terms are only ever posted as catch-ups, so the two paths can't charge the same month twice.
- **Leases that become active for a past month** (a lease backdated to start three months ago) show missing charges on each of those months' runs. The lease's Ledger tab also shows a banner: "3 months not charged" with one action to post all of them.

### Catch-up

Called from 02 when a term changes with an effective date in a charged month.

```text
for each period from effectiveDate's month to the last charged month:
  for each line affected by the change:
    should    = amount under the new terms
    charged   = sum of entries for this lease, period, and term (charge_run + catch_up + reversals)
    difference = should - charged
```

"Term" means the line key's prefix: `rent`, `estimate:{recoveryId}`, or `flat:{flatChargeId}`. Comparing by term rather than full line key matters, because a new estimate effective date produces a new line key for the same recovery.

Each non-zero difference becomes one entry with the line's kind, `period`, `poolId`, `source = catch_up`, and a description like "CAM estimate change effective Jan 1, 2026". One entry per period keeps per-year totals right for 06 when a catch-up crosses a year boundary.

## Manual entries

From the lease's Ledger tab:

- **Add charge.** Kind `fee` or `flat`, amount, date, optional period, description.
- **Add credit.** Amount, date, optional period, description.
- **Record payment.** Amount, received date, method (`check`, `cash`, `bank_deposit`, `other`), reference, memo. If 05 is live and the property has bank accounts, the form notes that deposits are usually matched from Transactions and links there.
- **Record refund.** Only when the balance is negative. Amount can't exceed the credit balance. Once 05 ships, refunds are usually created by matching the outgoing bank transaction instead.
- **Post opening balance.** Only when the lease has no opening balance. Amount (positive owed, negative credit), date (defaults to the day before the lease's first entry), memo.
- **Reverse.** On any entry that can be reversed. Requires a reason, which becomes the reversal's description. The original row shows "Reversed" with a link.

## Screens

### Lease Ledger tab

`/leases/[leaseId]/ledger`.

- Header: current balance, aging split (current, 1 to 30, 31 to 60, 61 to 90, over 90 days), last payment date and amount.
- Table: date, period, description, kind, charge, payment, running balance. Reversed entries and their reversals are shown with a strikethrough link between them. Filter by date range, kind, and pool.
- Actions: Add charge, Add credit, Record payment, Record refund, Post opening balance, Statement.
- **Statement of account.** Pick a date range. Opens a print-friendly page with property and tenant details, opening balance for the range, every entry, and closing balance. Download as PDF once 06's PDF renderer exists; until then, browser print.

### Rent roll

`/rent-roll?year=2026`.

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
- A "Charge runs" link lists every run for the property with period, posted by, posted at, totals, and skipped leases.

### Screen states

- **No active leases.** The rent roll explains that charges come from active leases and links to `/leases/new`.
- **Lease with no terms beyond base rent.** Charged base rent only. No warning unless the property has cost pools, in which case "No recoveries" appears in the preview as information.
- **Year with no entries.** The grid shows rows with empty cells and the opening balance.

## Dashboard cards

| Card | Condition |
|---|---|
| "{Month} charges not posted" | Today is on or after the 1st and the month has no charge run |
| "Balances over 30 days" | Count of leases with aging over 30 days greater than zero |
| "Months not charged" | Active leases with past periods missing charge run lines |

## Domain model

All in the Billing context, persisted in the `billing` schema.

### LeaseLedger (aggregate)

One per lease, keyed by `leaseId`. Holds a `version` and the entries. Commands append entries. The aggregate checks invariants 2, 3, 4, 6. Invariants 5 and 7 are checked by the application service and enforced by the database.

Loading a full ledger to append one entry is fine at this scale (a few hundred entries per lease per decade). If it ever isn't, the aggregate can load only what its invariants need: the opening balance, and the target entry for reversals.

| Command | Event |
|---|---|
| `PostCharge(kind, amount, date, period?, poolId?, lineKey?, source, description)` | `ChargePosted` |
| `PostCredit(amount, date, period?, description)` | `CreditPosted` |
| `RecordPayment(amount, receivedOn, method, reference?, bankTransactionId?, memo?)` | `PaymentRecorded` |
| `RecordRefund(amount, date, memo)` | `RefundRecorded` |
| `PostOpeningBalance(amount, date, memo)` | `OpeningBalancePosted` |
| `Reverse(entryId, reason)` | `EntryReversed` |
| `RemoveMatchedPayment(entryId)` | `MatchedPaymentRemoved` (05 only) |

### ChargeRun (aggregate)

Fields: `id`, `propertyId`, `period`, `postedAt`, `postedBy`, `skips` (`leaseId`, `reason`), totals by kind.

| Command | Rules | Event |
|---|---|---|
| `PostChargeRun(period, lines, skips)` | One per property and period. Period not in a locked year. Not more than 10 days before the period starts | `ChargeRunPosted` |
| `PostMissingCharges(lines)` | Run exists. Lines have no existing `charge_run` entry | `MissingChargesPosted` |

Posting a run writes the run and every lease's entries in one database transaction. If any line fails a uniqueness check, the whole run fails and the preview refreshes.

### Aging (read model)

Computed on read. Take all positive entries in date order and all negative entries in date order, apply negatives to the oldest positives first, and bucket what's left by days since its entry date. Reversals cancel their target before aging.

## API

| Procedure | Kind | Notes |
|---|---|---|
| `chargeRun.preview` | query | Input `{ period }`. Lines per lease, warnings, totals |
| `chargeRun.post` | mutation | Input `{ period, skips, extraCharges }`. Re-runs the preview server-side and posts that, not client-sent amounts |
| `chargeRun.list` | query | |
| `chargeRun.get` | query | |
| `chargeRun.previewMissing` | query | Input `{ period }` or `{ leaseId }` |
| `chargeRun.postMissing` | mutation | |
| `ledger.list` | query | Input `{ leaseId, from?, to?, kinds?, poolId? }` |
| `ledger.summary` | query | Balance, aging, last payment |
| `ledger.addCharge`, `ledger.addCredit` | mutation | |
| `ledger.recordPayment`, `ledger.recordRefund` | mutation | |
| `ledger.postOpeningBalance` | mutation | |
| `ledger.reverse` | mutation | Input `{ entryId, reason }` |
| `ledger.statement` | query | Input `{ leaseId, from, to }` |
| `ledger.previewCatchUp` | query | Used by 02's `lease.previewTermChange` |
| `rentRoll.get` | query | Input `{ year }`. One query, computed in SQL |
| `rentRoll.exportCsv` | query | |

Catch-up posting is not a client procedure. 02's lease mutations call a Billing application service inside their transaction.

## Data model

```text
billing.charge_runs
  id              uuid pk
  property_id     uuid not null
  period          date not null                     -- first of month
  posted_by       text not null
  posted_at       timestamp not null
  totals          jsonb not null
  unique (property_id, period)

billing.charge_run_skips
  charge_run_id   uuid references charge_runs on delete cascade
  lease_id        uuid not null
  reason          text not null
  primary key (charge_run_id, lease_id)

billing.lease_ledgers
  lease_id        uuid pk
  property_id     uuid not null
  version         integer not null default 0

billing.ledger_entries
  id                  uuid pk
  property_id         uuid not null
  lease_id            uuid not null references lease_ledgers
  kind                varchar(32) not null
  amount_cents        bigint not null
  entry_date          date not null
  period              date
  pool_id             uuid
  line_key            varchar(120)
  description         text not null
  source              varchar(32) not null
  charge_run_id       uuid references charge_runs
  reconciliation_id   uuid
  bank_transaction_id uuid
  payment_method      varchar(32)
  reference           varchar(64)
  reverses_entry_id   uuid unique references ledger_entries
  memo                text
  created_by          text not null
  created_at          timestamp not null default now()

  unique (lease_id, period, line_key) where source = 'charge_run'
  unique (lease_id) where kind = 'opening_balance'
  check (kind not in ('estimate','reconciliation') or pool_id is not null)
  index (lease_id, entry_date)
  index (property_id, period)
  index (bank_transaction_id)
```

The unique constraint on `reverses_entry_id` enforces "reversed at most once".

## Edge cases

- **Two operators post the same month.** The unique constraint rejects the second. They see the posted run.
- **Lease terms change between preview and post.** Post recomputes server-side. If totals differ from what the client saw, post fails with "Charges changed since preview" and the preview reloads.
- **Rent step on the 15th with prorate on.** Two `base_rent` entries that month, each with its own line key and day count in the description.
- **Lease ends on the 10th.** Final month prorated to 10 days. No charges after.
- **Lease ended early after the month was charged.** The operator reverses or credits the unused days by hand. The ledger tab shows a hint with the computed amount.
- **Payment larger than the balance.** Allowed. The balance goes negative and shows as a credit.
- **Opening balance entered after charges exist.** Allowed if dated before the first entry.
- **February with prorate.** Uses 28 or 29 days for that month.
- **Catch-up spanning December and January.** One entry per period, so each year gets its own share.

## Acceptance criteria

1. A charge run preview for a month shows, for every active lease, exactly the lines `monthlyBreakdown` implies, with proration by days when enabled.
2. Posting the same month twice is rejected by the database.
3. A skipped lease is listed on the run with its reason, and "Post missing charges" later charges it without duplicating anyone else.
4. Every `estimate` entry carries the pool id of its recovery, including catch-ups and reversals.
5. No UI or API path edits or deletes a posted entry, except the unmatch path from 05 before a year is locked.
6. Reversing an entry creates a linked opposite entry, and the original can't be reversed again.
7. A lease's balance equals the sum of its entries, and the rent roll month-end balances agree with the ledger.
8. Aging buckets add up to the positive balance.
9. A catch-up posted from 02 produces one entry per affected period with the right kind and pool.
10. The statement of account for a date range shows the opening balance, every entry, and the closing balance.

## Open questions

1. Should operators be able to post charges for a month further ahead than 10 days, for tenants who prepay?
2. Is balance-forward enough, or do you want payments applied to specific charges now? Applying later means backfilling allocations for existing payments.
3. Should month-to-month leases default to being charged at the last terms, or skipped until someone decides?
