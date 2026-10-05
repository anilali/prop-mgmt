# v1: Rent tracking and the 2026 reconciliation

## Summary

Help the owner of one commercial property with five tenants do two jobs: know who has paid what during the year, and produce the year-end reconciliation letters. The owner enters the leases once and imports the bank account's CSV. The app matches deposits to tenants, sorts expenses into categories, shows who's behind, and at year-end works out each tenant's share of shared costs, prints a statement and letter for each, and sets next year's estimates.

The target is running the 2026 reconciliation in the app in December 2026.

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
- Every expense used in the reconciliation is a bank transaction or a cash expense the owner entered.
- Rent increases and expiring insurance certificates show up before they're due.

## Not in v1

- Tenant access to statements or balances. Planned for 2027.
- Sending letters from the app. The owner prints and emails them.
- Charging late fees automatically.
- More than one bank account, and transfers between accounts.
- Storing lease documents, insurance certificate files, or receipts. The owner sends tax and insurance receipts separately from the PDF.
- Unit area changes during a year, and combining or splitting units.
- Prorating a month a lease covers only part of. Leases almost always start and end on month boundaries.
- Lease terms like caps, admin fees, or excluded costs. None of the current leases have them.
- Locking a year after it's reconciled.

## Concepts

- **Unit.** A space in the building with a label, an address, and an area in sqft.
- **Cost pool.** A shared cost and the units that share it. CAM, taxes, and insurance are shared by every unit in the building. Water is shared by the two units on the shared meter.
- **Share.** A unit's area divided by the total area of its pool's units. Vacant units stay in the total, so the owner pays for empty space.
- **Lease.** One tenant in one unit for a date range, with base rent and a monthly estimate for each pool it pays.
- **Expected.** What a lease should have paid by a date: base rent plus estimates for each month so far, plus approved fees and adjustments.
- **Balance.** Expected minus payments received. Positive means the tenant is behind.
- **True-up.** For each pool, the tenant's part of the year's actual cost minus the estimates they were expected to pay.

## Setup

Done once, then updated when something changes.

### Property

- Name, and the date tracking starts. For this property that's January 1, 2026.
- The details the letters print: owner name, company, phone, and email.

### Units and pools

- Each unit has a label, a street address with an optional suite, and an area in whole sqft.
- Each cost pool has a name and a list of units. The share table shows each unit's sqft and share, and updates as units are checked and unchecked.
- New properties start with four pools: CAM, Taxes, and Insurance with every unit, and Water with none.

### Categories

Every transaction goes in one category. Each category has a kind, which can't change:

| Kind | Used for | Default categories |
|---|---|---|
| Shared cost | Costs split across a pool. Each has exactly one pool. | CAM, Taxes, Insurance, Water |
| Owner expense | Costs the owner pays alone | Repairs, Owner utilities |
| Income | Money in that isn't a tenant payment | Other income |
| Not counted | Left out of all totals | Security deposit, Not property business |

Tenant payments aren't a category. A deposit is either matched to a lease or put in an income or not-counted category. The owner can add, rename, and archive categories.

### Tenants and leases

A tenant has a business name, a contact name, a mailing address, an email, and a phone.

A lease has:

- **Tenant and unit.**
- **Start date and end date.** A move-out date is added if the tenant leaves early.
- **Base rent.** A list of monthly amounts, each with the date it starts. An "Add increase" helper takes a date and a percentage or a new amount.
- **Estimates.** For each pool the unit is in, whether the lease pays it, and a monthly estimate with the date it starts. Estimates change each January 1 after the reconciliation.
- **Late fee.** Optional. A flat amount, and the day of the month after which it applies, such as the 10th.
- **Insurance certificate.** The date the tenant's current certificate expires, if one is on file.
- **Opening balance.** What the tenant owed when tracking started, including last year's true-up.

A lease counts every month it's active for at least one day. Each counted month expects the full base rent and estimates.

## Bank activity

### Import

- The owner uploads the bank's CSV. The first time, they match its columns to date, description, and amount, and the app remembers.
- Importing an overlapping date range never creates duplicates.
- The owner adds cash expenses by hand with a date, description, amount, and category.

### Sorting

New transactions land in a "To sort" list.

- **Money out** gets a category. The app suggests the category last used for the same description.
- **Money in** is matched to a lease or given a category. The app suggests a lease that paid from the same description before, or whose monthly expected amount equals the deposit. The owner confirms.
- A sorted transaction can be changed later.

## Rent status

A table of leases with expected so far, received so far, balance, and last payment date. Leases that are behind are listed first.

Each lease has a history of what makes up its balance: opening balance, each month's expected amount, payments, fees, adjustments, and true-ups.

- **Late fees.** When a lease has a late fee and still has a balance after its day of the month, the app suggests the fee. The owner approves it, which adds it to the balance, or dismisses it for that month.
- **Adjustments.** The owner can add a credit or charge to a lease with a note, for anything the rules don't cover.

## Coming up

The home page lists:

- Leases that are behind, with any late fees waiting for approval.
- The number of transactions to sort.
- Base rent changes in the next 90 days. The owner marks each one "Tenant notified".
- Insurance certificates that are missing or expire in the next 60 days.
- Leases ending in the next 90 days.

## Year-end reconciliation

### The math

For each lease and each pool it pays:

```text
months        = months the lease was active in the year
share         = unit sqft / total sqft of the pool's units
their part    = pool's actual cost x share x months / 12
estimates     = the lease's monthly estimates for those months, added up
balance       = their part - estimates
```

A pool's actual cost is the year's transactions in its category. When payments don't line up with the year, as with taxes paid in installments, the owner enters the year's bill amount with a note, and the app uses that instead. Amounts round to the cent once, on each line.

```text
true-up             = the balances for every pool, added up
balance on account  = true-up + the lease's balance on the letter date
new monthly estimate, per pool = pool's actual cost x share / 12
new monthly rent    = base rent on January 1 + the new estimates
```

The new estimate uses a full year's share even when the tenant was only there part of the year.

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

The spreadsheet shows $237.75, $651.49, and $3,674.63 because it adds unrounded amounts. The app rounds each line to the cent first, so every total on the statement equals the sum of the lines printed above it.

### The workspace

The Reconciliation page lists each year. Opening a year shows:

- A checklist: no transactions dated in the year are left to sort, and every pool a lease pays has at least one unit.
- One card per pool with the actual cost and the transactions behind it. When a bill amount is entered, the card shows the bill and the payments side by side.
- One statement per lease that pays at least one pool, including tenants who moved out during the year.

### Statement and letter

Each lease gets one PDF with a letter and a statement, following the owner's current versions.

The letter has the date, the tenant's mailing address, the year and unit address, the true-up, the new monthly rent from January 1, the balance on account, and the owner's signature details. If no insurance certificate on file covers January 1 of the next year, it asks the tenant to send one.

The statement shows the building area and each pool's area, each pool's actual cost and cost per sqft, the table above with a months column for partial years, the new monthly rent, and the balance on account.

### Finalize

Finalizing a year:

- Saves each lease's PDF for download.
- Adds each true-up to its lease's balance, dated the letter date.
- Sets each active lease's new estimates from January 1 of the next year.

It runs once per year. A mistake found later is fixed with an adjustment on the lease.

## Acceptance criteria

1. The owner can enter the property, units, pools, tenants, and leases, including base rent steps, estimates, late fee, insurance date, and opening balance.
2. Each unit's share in a pool equals its sqft divided by the total sqft of the pool's units, and vacant units count in the total.
3. Importing the same CSV twice, or two overlapping ones, creates no duplicates.
4. Every transaction can be categorized, and every deposit can be matched to a lease. Suggestions never apply without the owner confirming.
5. A lease's balance equals its opening balance plus expected amounts, fees, adjustments, and true-ups, minus payments.
6. A late fee is only added when the owner approves it.
7. The home page shows leases behind, transactions to sort, rent changes in 90 days, insurance certificates missing or expiring in 60 days, and leases ending in 90 days.
8. Running 2024 through the app gives the same line amounts as the spreadsheet. Totals can differ by a cent or two, because the app adds rounded lines.
9. A tenant who moved out in August gets 8/12 of their share and 8 months of estimates.
10. A pool's actual cost is the year's transactions in its category, or the bill amount when the owner enters one.
11. Finalizing produces one PDF per lease, adds each true-up to its balance, and sets next year's estimates.
