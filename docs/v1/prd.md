# v1: Rent tracking and the 2026 reconciliation

## Summary

Help the owner of one commercial property with five tenants do two jobs: know who has paid what during the year, and produce the year-end reconciliation letters. The owner enters the leases once and imports the bank account's CSV. The app matches deposits to tenants, sorts expenses into categories, shows who's behind, and at year-end works out each tenant's share of shared costs, prints a statement and letter for each, and sets next year's estimates.

The target is a dry run in mid-November 2026 on January to October data, then finalizing the 2026 reconciliation in early January 2027, after December's bank activity is imported.

## How it works today

- Tenants know what to pay each month: base rent plus an estimate for shared costs. Some pay by autopay, some by check. Nobody sends invoices.
- Everything goes through one business bank account. There are one to three cash expenses a year.
- The amounts each tenant should pay live in last year's reconciliation spreadsheet. Who has paid, rent increases, and late fees are tracked in the owner's head.
- At year-end the owner copies a spreadsheet per tenant, types in the year's cost totals, and writes a letter by hand. This takes a long time.

## Starting points

1. Build for one property and five tenants. Anything that only pays off at a larger scale waits.
2. The app follows the owner's spreadsheet math. It doesn't add precision the owner doesn't use, such as day counts or area history.
3. What a tenant should pay comes from the lease. Nobody posts monthly charges.
4. The owner approves anything that changes what a tenant owes. The app suggests and doesn't act on its own.
5. Other owners may use it later, so things that differ between properties, like categories and pools, are settings, not code.

## Goals

- The 2026 letters and statements come out of the app, matching what the spreadsheet would have produced.
- At any point in the year, the owner can see who's behind and by how much.
- Every expense used in the reconciliation is a bank transaction, a cash expense the owner entered, or a bill amount with a note.
- Rent increases and expiring insurance certificates show up before they're due.

## Not in v1

- Tenant access to statements or balances. Planned for 2027.
- Sending letters from the app. The owner prints and emails them.
- Charging late fees automatically.
- More than one bank account, and transfers between accounts.
- Storing insurance certificate files or receipts. The owner sends tax and insurance receipts separately from the PDF.
- Unit area or pool membership changes during a year, and combining or splitting units. The current values apply to the whole year.
- Prorating a month a lease covers only part of. Leases almost always start and end on month boundaries.
- Lease terms like caps, admin fees, or excluded costs. None of the current leases have them.
- Locking everything in a year after it's reconciled. A finalized year's letter date and bill amounts can't change, and its true-ups can't be removed. Fees and adjustments dated on or before December 31 of the latest finalized year can't be edited or removed, and new ones are dated the day they're saved. Other data can still change, and the year shows the differences.

## Concepts

- **Unit.** A space in the building with a label, an address, and an area in sqft.
- **Cost pool.** A shared cost and the units that share it. CAM, taxes, and insurance are shared by every unit in the building. Water is shared by the two units on the shared meter.
- **Share.** A unit's area divided by the total area of its pool's units. Vacant units stay in the total, so the owner pays for empty space.
- **Account.** One tenant in one unit. The account holds the money: opening balance, payments, fees, adjustments, and true-ups. It gets one statement a year. A tenant who rents two units has two accounts.
- **Lease.** The terms for an account over a date range: base rent and a monthly estimate for each pool it pays. A renewal is a new lease on the same account.
- **Expected.** What an account should have paid by a date: base rent plus estimates for each month so far, plus approved fees and adjustments.
- **Balance.** Expected minus payments received. Positive means the tenant owes money. Negative is a credit.
- **True-up.** For each pool, the tenant's part of the year's actual cost minus the estimates they were expected to pay.

## Setup

Done once, then updated when something changes.

### Property

- Name, time zone, and the date tracking starts. For this property that's January 1, 2026, in Central time. The tracking start is the first of a month and can't change once any transaction or balance entry exists.
- The details the letters print: owner name, title, company, phone, and email.

### Units and pools

- Each unit has a label, a street address with an optional suite, and an area in whole sqft.
- Each cost pool has a name and a list of units. The share table shows each unit's sqft and share, and updates as units are checked and unchecked.
- New properties start with four pools: CAM, Taxes, and Insurance, which include every unit and take new units automatically, and Water with none.

### Categories

Every transaction goes in one category, or is split across several. Each category has a kind, which can't change:

| Kind | Used for | Default categories |
|---|---|---|
| Shared cost | Costs split across a pool. Each has exactly one pool. | CAM, Taxes, Insurance, Water |
| Owner expense | Costs the owner pays alone | Repairs, Owner utilities |
| Income | Money in that isn't a tenant payment | Other income |
| Not counted | Left out of all totals | Security deposit, Not property business |

Tenant payments aren't a category. A payment is matched to an account. The owner can add, rename, and archive categories. Shared-cost categories can't be archived.

### Tenants, accounts, and leases

A tenant has a business name, a contact name, a mailing address, an email, and a phone.

An account has a tenant, a unit, and an opening balance: what the tenant owed when tracking started, including last year's true-up, with a prepayment entered as a negative amount. Only an account that started on or before the tracking start has one. A later account that needs a starting amount gets an adjustment.

A lease belongs to an account and has:

- **Start date and end date.** A move-out date is added when the tenant leaves, early or as planned.
- **Base rent.** A list of monthly amounts, each with the date it starts. An "Add increase" helper takes a date and a percentage or a new amount. On the account page, each later step that starts this year or after has a "Tenant notified" toggle. Steps from earlier years show none.
- **Estimates.** For each pool the unit is in, a monthly estimate with the date it starts. The lease pays a pool from its first estimate for that pool, which can be partway through the lease. Estimates change each January 1 after the reconciliation.
- **Fixed charges.** Optional monthly extras that are not reconciled, such as sign rent ($35) or trash ($50). Each has a name and a list of monthly amounts, each with the date it starts. An amount of 0 stops the charge.
- **Late fee.** Optional. A flat amount, and the day of the month after which it applies, such as the 10th.
- **Insurance certificate.** The date the tenant's current certificate expires, if one is on file.

An account expects rent every month it's active for at least one day, counting from the later of its start and the tracking start. Each counted month expects the full base rent, estimates, and fixed charges in effect on the later of the 1st and the account's start. A renewal that starts mid-month bills that month at the old lease's terms.

If the newest lease passes its end date with no move-out date, the account keeps expecting that lease's last rent, estimates, and fixed charges until the owner adds a renewal or a move-out date.

A tenant moving to another unit gets a new account. The remaining balance moves with an adjustment on each account.

### Lease documents

Each account page has a Documents list for signed leases and other PDFs.

- The owner uploads a PDF of up to 25 MB and can tie it to one of the account's leases.
- Each document shows its name, upload date, and size. The owner can download it or remove it after confirming.
- An account with documents can't be deleted until its documents are removed.
- If file storage isn't set up, the list says so and uploads are turned off.

## Bank activity

### Import

- The owner uploads the bank's CSV or QuickBooks (QBO/OFX) file.
- For a CSV, the first time, they match its columns to date, description, and amount, and the app remembers. The amount can be one signed column or separate debit and credit columns.
- A QuickBooks file needs no column matching. The app uses the bank's transaction id to tell rows apart. The preview shows the last 4 digits of the account and the file's date range. It warns when the account differs from earlier QuickBooks files.
- Importing an overlapping date range never creates duplicates.
- Rows dated before the tracking start are skipped and counted.
- A row with an amount but a date that can't be read is shown before importing. The owner fixes the column matching or skips the row. In a QuickBooks file, a row with a bad date, a bad amount, or no transaction id is shown the same way, and the owner skips it. Nothing with an amount is left out without the owner seeing it.
- An import can be removed as long as none of its transactions have been sorted.
- The owner adds cash expenses by hand with a date, description, amount, and category.

### Sorting

New transactions land in a "To sort" list.

- **Money out** gets a category. The app suggests the category last used for the same description.
- **Money in** is matched to an account or given a category. The app suggests an account that paid from the same description before, or whose monthly expected amount equals the deposit. The owner confirms.
- A transaction can be split into parts that add up to its amount, each matched to an account or given a category. For example, one check for two units, or a landscaper bill that's partly CAM and partly a repair.
- A deposit can go to a shared-cost category, which lowers that pool's cost, such as an insurance refund. A withdrawal can be matched to an account, such as a bounced check or a refund to a tenant.
- A sorted transaction can be changed later.

## Rent status

A table of accounts with expected so far, received so far, balance, last payment date, and a status. Accounts that are behind are listed first.

- **Due.** A month's rent counts as owed from the 1st, or from the move-in day when the tenant moves in mid-month. Until the lease's late-fee day, or the 5th if it has no late fee, a balance from this month alone shows as Due.
- **Behind.** A balance left after that day, or left over from an earlier month.

Each account has a history of what makes up its balance: opening balance, each month's expected amount, payments, fees, adjustments, and true-ups.

- **Late fees.** When a lease has a late fee, the app suggests it if payments from the 1st through the fee day, plus any credit carried into the month, come to less than that month's expected amount. The suggestion shows only during that month. Older balances and true-ups never trigger a fee on their own. The owner approves it, which adds it to the balance dated the day after the fee day, or dismisses it. A missed fee, or a fee for a check that bounced after the fee day, is added by hand as an adjustment.
- **Adjustments.** The owner can add a credit or charge to an account with a note, for anything the rules don't cover.

## Coming up

The home page lists:

- Accounts that are behind, with any late fees waiting for approval.
- The number of transactions to sort.
- Base rent changes in the next 90 days. The owner marks each one "Tenant notified".
- Insurance certificates that are missing or expire in the next 60 days.
- Leases ending in the next 90 days, and accounts past their lease's end date with no renewal or move-out ("Past end date").

## Year-end reconciliation

### The math

For each account and each pool it pays:

```text
months        = months in the year the account was active and paid the pool
share         = unit sqft / total sqft of the pool's units
their part    = pool's actual cost x share x months / 12
estimates     = the monthly estimates expected for those months, added up
balance       = their part - estimates
```

Estimates are what the tenant was expected to pay, not what they actually paid. A short payment stays in the rent balance.

A pool's actual cost is the year's transactions in its category, with refunds subtracting. When payments don't line up with the year, as with taxes paid in installments, the owner enters the year's bill amount with a note, and the app uses that instead. Amounts round to the cent once, on each line.

```text
true-up             = the balances for every pool, added up
balance on account  = true-up + the account's balance at the end of December 31
new monthly estimate, per pool = pool's actual cost x share / 12
new monthly rent    = base rent on January 1 + fixed charges on January 1 + the new estimates
```

Fixed charges are not reconciled. They are not in the estimates, the true-up, or the pool table. They count in the monthly rent and the rent balance.

The December 31 balance counts expected amounts through December only, before the true-up. The new estimate uses a full year's share even when the tenant was only there part of the year.

Example: a 2,500 sqft unit in a 9,350 sqft building, leased all of 2024.

```text
              Actual      Share    Their part   Estimates   Balance
CAM          12,891.19   26.74%     3,446.84     3,223.32     223.52
Taxes        33,542.31   26.74%     8,968.53     9,331.32    -362.79
Insurance     6,284.00   26.74%     1,680.21     1,303.20     377.01
True-up                                                       237.74
Unpaid rent                                                   413.74
Balance on account                                            651.48
New monthly rent from Jan 1: 2,500.00 + 287.24 + 747.38 + 140.02 = 3,674.64
```

The spreadsheet shows $237.75, $651.49, and $3,674.63 because it adds unrounded amounts. The app rounds each line to the cent first, so every total on the statement equals the sum of the lines printed above it. The share is printed rounded but used unrounded.

A negative true-up is a credit. It goes onto the account's balance, and the letter says it has been applied to the account.

### The workspace

The Reconciliation page lists each year. Opening a year shows:

- A checklist. These block finalizing:
  - Transactions dated in the year are still waiting to be sorted.
  - A pool a lease pays has no units.
  - A lease pays a pool its unit isn't in.
  - A pool's actual cost is negative.
  - Letter details or a tenant's mailing address are missing.
  - A statement can't be computed.
- Finalizing also needs a letter date in the next year, today to be after December 31, and the previous year to be finalized, unless this is the first year reconciled in the app.
- These only warn:
  - The newest bank data is before December 31.
  - A pool used a bill amount last year but has none this year.
  - An account is past its lease's end date.
  - Pool members or unit sqft changed during the year.
  - A pool the tenant paid in December has no estimate on the lease that covers January 1. Finalize adds it.
- One card per pool with the actual cost and the transactions behind it. When a bill amount is entered, the card shows the bill and the payments side by side.
- One statement per account that pays at least one pool, including tenants who moved out during the year.
- A preview of each PDF before finalizing.

### Statement and letter

Each account gets one PDF with a letter and a statement, following the owner's current versions.

The letter has the letter date, the tenant's mailing address, the year and unit address, the true-up, the new monthly rent from January 1, the balance on account, and the owner's signature details. If no insurance certificate on file covers January 1 of the next year, it asks the tenant to send one. The paragraph about the new rent names the pools it covers, such as "CAM, tax, insurance, and water". It is the only place the letter names pools. When the lease has a base rent step later in the next year, the letter adds one sentence per step with the old and new base rent, the date, and the new total monthly rent. A tenant who isn't continuing into the next year, such as one who moved out, gets the letter without that paragraph, the revised rent block, or the insurance request.

The owner sets the letter date on the year, and it must be in the next year. No date is saved until the owner sets one. The field suggests January 1 of the next year.

The statement follows the owner's spreadsheet. It shows the building's net rentable area and the area of each other pool the tenant pays, each pool's actual cost and cost per sqft per year and per month, and the table above with a months column for partial years. The tenant's name and unit address sit to the left of the table, and the true-up sits in a box under the balance due. Below it come the revised monthly rent with each line (base rent, each estimate, each fixed charge), the unpaid balance, and the balance on account. It uses the owner's column labels.

### Finalize

Finalizing a year:

- Saves each account's PDF for download, and a copy of each statement's numbers.
- Adds each true-up to its account's balance, dated the letter date.
- Sets new estimates from January 1 of the next year for each account that has a statement. They go on the lease covering January 1, for every pool the tenant paid in December if the unit is still in it, and every pool that lease has estimates for.

It runs once per year. If data in a finalized year changes later, the year shows how each statement differs from what was saved. A mistake is fixed with an adjustment on the account.

## Acceptance criteria

1. The owner can enter the property, units, pools, tenants, accounts, and leases, including base rent steps, estimates, late fee, insurance date, and opening balance.
2. Each unit's share in a pool equals its sqft divided by the total sqft of the pool's units, and vacant units count in the total.
3. Importing the same CSV or QuickBooks file twice, or two overlapping ones, creates no duplicates.
4. Every bank transaction can be categorized or split, and every deposit can be matched to an account. A cash expense has one category and isn't split. Suggestions never apply without the owner confirming.
5. An account's balance equals its opening balance plus expected amounts, fees, adjustments, and true-ups, minus payments.
6. A late fee is only added when the owner approves it.
7. The home page shows accounts behind, transactions to sort, rent changes in 90 days, insurance certificates missing or expiring in 60 days, leases ending in 90 days, and accounts past their end date.
8. Running 2024 through the app gives the same line amounts as the spreadsheet. Totals can differ by a cent or two, because the app adds rounded lines.
9. A tenant who moved out in August gets 8/12 of their share and 8 months of estimates.
10. A pool's actual cost is the year's transactions in its category, or the bill amount when the owner enters one.
11. Finalizing produces one PDF per account, adds each true-up to its balance, and sets next year's estimates.
12. A renewal on the same account produces one statement for the year, covering both leases.
