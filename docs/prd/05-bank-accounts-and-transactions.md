# 05. Bank accounts and transactions

Depends on: 01 (categories, Settings), 02 (tenants, bank aliases), 04 (payments). Used by: 06 (actual costs per pool).

## Summary

A property has one or more bank accounts. Operators import each account's activity from a CSV export, sort spending into categories with help from rules, mark transfers between the property's own accounts, and match deposits to tenant payments. Every transaction belongs to one bank account and, through it, to one property. The categorized spending is what 06 adds up as actual costs.

## Problem

- The portal has no record of what the property spent. Reconciliation can't happen without it.
- Tenant payments arrive as bank deposits. Typing them into a ledger by hand is slow and error-prone.
- Most spending repeats every month (utilities, phone, water). Categorizing the same vendor by hand every month is busywork.
- Bank CSV exports differ by bank, and the same bank sometimes changes its format.
- Re-downloading an overlapping date range must not create duplicates.

## Goals

- Importing a month of activity for an account takes under a minute after the first time.
- Recurring vendors are categorized automatically after the operator has categorized them once.
- Every deposit from a tenant becomes a ledger payment with one confirmation.
- Re-importing any date range never creates duplicates.
- Every total 06 uses can be traced to the transactions behind it.

## Non-goals

- Live bank connections.
- Matching the portal's balance to the bank statement balance (bank reconciliation). See open questions.
- Accounts shared between properties. A bank account belongs to exactly one property.
- Paying bills from the portal.
- Receipt OCR.

## Users and permissions

| Action | Staff | Admin |
|---|---|---|
| View accounts and transactions | yes | yes |
| Add, edit, and close bank accounts, edit import formats | no | yes |
| Import CSVs and undo imports | yes | yes |
| Categorize, split, note, and attach receipts | yes | yes |
| Create and edit categorization rules | yes | yes |
| Match and unmatch deposits | yes | yes |

Bank accounts live in Settings (admin). Rules live on the Transactions screen, since staff maintain them while categorizing.

## Glossary

- **Bank account.** An account the property uses: checking, savings, or credit card.
- **Import format.** How to read one account's CSV: which columns hold what, the date format, and the sign convention.
- **Import.** One uploaded CSV file and the transactions it added.
- **Transaction.** One imported line. Positive amount means money into the account, negative means money out.
- **Category line.** A part of a transaction assigned to one category. A transaction has one or more lines summing to its amount.
- **Rule.** An instruction to categorize matching transactions automatically on import.
- **Needs review.** A transaction whose category lines don't cover its whole amount.
- **Transfer.** Money moving between two of the property's own accounts. Appears once in each.
- **Match.** Linking a deposit to one or more lease payments.
- **Bank alias.** Text that appears in a tenant's deposits, stored on the tenant (02).

## User stories

- As an admin, I add the property's operating account and its debit card, and the credit card used for supplies.
- As an operator, I upload the first CSV for an account, map its columns once, and never map them again.
- As an operator, I re-download the last 90 days and upload them, and only new transactions are added.
- As an operator, I categorize a Verizon charge as CAM and accept "always categorize VERIZON WIRELESS as CAM".
- As an operator, I work through 40 uncategorized transactions with the keyboard.
- As an operator, I split a check that paid for both a repair and a CAM expense.
- As an operator, I mark a transfer from checking to savings, and the portal finds the matching row in savings.
- As an operator, I confirm that a $3,654.82 deposit is Super Lucky's rent, and the payment appears on their ledger.
- As an operator, I split one deposit across a tenant's two leases.
- As an operator, I see total spending per category for each month of the year.

## Bank accounts

### Fields

| Field | Notes |
|---|---|
| Name | Required. "Operating checking" |
| Type | Checking, savings, or credit card |
| Institution | Optional. Bank name |
| Last 4 digits | Optional. Shown next to the name everywhere |
| Status | Open or closed |
| Import format | Set on first import. Editable |

Rules:

- Name is unique per property among open accounts, ignoring upper and lower case.
- An account belongs to one property forever. There's no move action.
- An account with transactions can be closed but not deleted. Closed accounts reject imports and keep their history. They can be reopened.
- An account with no transactions can be deleted.

### Import format

| Setting | Options |
|---|---|
| Header row | Row number of the header, default 1 |
| Date column and format | MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, DD/MM/YYYY. Detected from the first rows and confirmed by the admin or operator |
| Description column | One column, or several joined with a space |
| Amount | One signed column, or separate debit and credit columns |
| Sign convention | For a signed column: "positive is money in" or "positive is money out". Credit card exports often use the second |
| Check number column | Optional |

Amounts are read leniently: dollar signs, commas, surrounding spaces, and parentheses for negatives are handled. Anything that still can't be read is a skipped row with a reason.

Import formats are edited on the Bank accounts tab in Settings. Staff map the format on an account's first import too, since that happens in the import flow. After that, only admins edit it.

## Import flow

From the Transactions screen, "Import" opens a sheet.

1. **Pick account and file.** Accounts list shows each one's last imported date range. The original file is kept for audit.
2. **Map** (first import, or when the file's headers don't match the saved format). Shows the first 10 rows as a table with a column-role picker above each column. The parsed result for those rows updates live below.
3. **Preview.** Every row, parsed, with a status:
   - New: will be added. Shows the category a rule would assign, if any.
   - Duplicate: already imported. Greyed out.
   - Skipped: couldn't be read. Shows the reason. Summary rows banks add at the bottom usually land here.
   - Counts of each at the top, and the date range.
4. **Import.** Adds the new rows and records the import. Lands on the review inbox filtered to this import.

Files can have up to 10,000 rows.

### Duplicate detection

A row is a duplicate when the same account already has a transaction with the same date, amount, description, and check number. Descriptions are compared ignoring upper and lower case and extra spaces. The same row in two different accounts is not a duplicate.

Identical rows in one file are counted. If a file has two identical $5.00 coffee charges on the same day, both are imported. A later file overlapping that day with the same two rows skips both. If the later file has three, the third is new.

### Undo an import

An import can be undone while none of its transactions is matched to a payment, paired as a transfer, or in a reconciled year. Undo deletes those transactions and their category lines and marks the import undone. This is the only way transactions get deleted. It exists because a wrong file or a wrong account is a common mistake right after import.

## Categorizing

### Category lines

Each transaction has zero or more category lines. Each line has a category, an amount, an optional note, and a source: a rule, the operator, a deposit match, or a transfer.

Rules:

1. Line amounts have the same sign as the transaction and sum to at most the transaction amount. A transaction is fully categorized when they sum to exactly the amount.
2. Categories must be active (not archived) and belong to the property.
3. Tenant Payment lines are only created by matching (below), never chosen by hand or by a rule.
4. On transactions dated in a year locked by 06, existing lines can't change and no line in a recoverable category can be added. New transactions in that year can still be categorized into other kinds and matched. Notes and receipts can still be added and edited. See "Year lock" in 06.
5. Changing a transaction's categories replaces only the lines an operator or a rule made. Lines from a deposit match or a transfer stay. To change those, the operator unmatches or unpairs the transaction first.
6. A transaction with a match or transfer line can't have its categories cleared. The operator unmatches or unpairs it first.

Imported fields (date, amount, description, check number) never change. Category lines, notes, and receipts sit alongside.

### Review inbox

The Transactions screen opens on **Needs review**: every transaction across the property's accounts that isn't fully categorized, newest first. Filters: account, import, date range, money in or out.

```text
[ ] Date     Account        Description                         Amount      Category
[ ] Jun 19   Op. ••0001     VERIZON WIRELESS PAYMENTS           -$245.73    [ CAM         v ]
[ ] Jun 12   Op. ••0001     CITY PUBLIC SRV CPS BILL            -$26.06     [ choose...   v ]
[ ] Jun 03   Op. ••0001     DEPOSIT SUPER LUCKY LLC             +$3,654.82  Match: Super Lucky 4710  [Confirm]
```

Working through it:

- `j` / `k` move between rows. `c` opens the category picker with type-to-filter. `Enter` saves and moves to the next row.
- `s` opens the split editor. `m` opens the match panel for deposits. `n` adds a note. `x` selects the row.
- With rows selected, a bar offers "Categorize selected as…".
- After a manual categorization, a toast offers **"Always categorize transactions like this as CAM"**. Accepting opens the rule editor pre-filled with the description's leading words, the direction, and the account.
- Categorized rows leave the inbox with a short undo window.

Other tabs:

- **All.** Every transaction with filters for account, date, category, amount range, and text search.
- **Summary.** A table of categories by month for the selected year, with totals. Each cell links to the filtered transaction list. Transfer and excluded categories are listed separately below the totals. Totals include every account the property has, open or closed, and show spending as a positive number. 06 uses the same totals and can list the lines behind each one.
- **Imports.** Every import with account, file, date range, counts, who and when, and the undo action.

### Split editor

A list of category lines with amounts, and a "remaining" figure that must reach zero to save. Each line can have a note.

### Receipts

A transaction can have attachments (PDF or image, same limits as 03). Shown as a paperclip in the list. Useful when a tenant questions a CAM charge during reconciliation.

## Rules

Rules have their own page under Transactions. They form an ordered list. On import, each new transaction is checked against enabled rules in order and the first match assigns its category as one line covering the full amount.

Rule fields:

| Field | Notes |
|---|---|
| Pattern | Text to look for in the description, ignoring upper and lower case and extra spaces |
| Match type | Contains, starts with, or equals |
| Direction | Money in, money out, or either |
| Account | Optional. Limits the rule to one account |
| Amount range | Optional minimum and maximum, compared ignoring the sign |
| Category | Can't be Tenant Payment |
| Enabled | On or off |

Behavior:

- Rules never override a manual or match category line. They only apply to transactions with no lines.
- Rules run on import. Creating or editing a rule offers "Apply to N uncategorized transactions that match", with a preview of those transactions.
- Each rule shows how many transactions it has categorized and when it last matched.
- A **test box** at the top: paste a description and amount and see which rule would match.
- Drag to reorder.

## Transfers

Categorizing a transaction as Transfer (the category from 01) looks for its other side:

- in another account of the same property
- with the opposite amount
- dated within 5 days
- not yet categorized

If there's exactly one candidate, it's suggested and confirming categorizes both and links them as a pair. With several, the operator picks. With none, the transaction saves as an unpaired transfer, and the Summary tab lists unpaired transfers so they get a second look. Money moving to an account outside the property isn't a transfer. It's an expense, income, or excluded.

Unpairing removes both transfer lines and returns both transactions to the inbox.

## Matching deposits to payments

### Suggestions

Each uncategorized deposit gets up to three suggested leases, scored by:

| Signal | Weight |
|---|---|
| Description contains one of the tenant's bank aliases, ignoring case and extra spaces | strong |
| Amount equals the lease's monthly total for that month | strong |
| Amount equals the lease's balance on the deposit date | medium |
| Tenant's display or legal name words appear in the description | weak |

A suggestion appears only when at least one strong signal is present. The inbox shows the top one inline. The match panel shows all three with the reasons.

### Match panel

Opened with `m` or by clicking the suggestion.

- **Confirm a suggestion.** One payment for the full amount on that lease.
- **Pick a lease.** Search by tenant or unit.
- **Split.** Several rows of lease and amount, plus an optional "Other income" row. Remaining must reach zero. Used when one tenant pays two leases in one deposit.
- **Not a tenant payment.** Categorize normally instead (Other Income, Transfer, and so on).
- **Save alias.** When the confirmed lease's tenant had no alias in the description, a checkbox offers to save a suggested alias (the description's leading words, editable). Saving adds the alias to the tenant (02).

Confirming does all of the following together, or none of it:

1. Creates a payment on each lease's ledger (04), recorded as a bank deposit, dated the transaction date, and linked to the transaction.
2. Creates category lines on the transaction: one Tenant Payment line for the total paid to leases, plus any other lines from the split.

The link from a transaction to a payment is kept with the transaction, not on the ledger entry. That lets a transaction point at a payment that was posted earlier by hand (below) without editing a posted entry. A payment or refund can be linked to at most one transaction.

### Refunds

Money-out transactions get a "Tenant refund" option in the match panel when any lease has a credit balance. Choosing a lease and amount creates a refund on that lease's ledger (04), links it as above, and adds a negative Tenant Payment line. The refund can't exceed the lease's credit balance.

Matches always need a confirmation. A wrong automatic match would move money between tenants without anyone noticing.

### Unmatch

Available on matched transactions. Removes the payments the match created from the ledger (04), removes all the transaction's payment links, removes the Tenant Payment line, and returns the deposit to the inbox. A payment that was only linked (posted by hand earlier) stays on the ledger. Only the link goes. Blocked when the transaction is in a year locked by 06, and blocked if any of the payments has been reversed (the operator handles that case on the ledger).

### Payments recorded by hand first

If an operator recorded a check payment by hand in 04 and later imports the deposit, the match panel shows "Possible existing payment: $3,654.82 on Jun 2 on Super Lucky 4710" when a manual payment on a suggested lease has the same amount within 7 days and isn't linked to a transaction yet. Choosing "Link existing payment" links the deposit to that payment instead of creating a new one. The ledger entry itself doesn't change.

## Screens summary

| Screen | Purpose |
|---|---|
| Transactions, Needs review tab | Inbox (default tab) |
| Transactions, All tab | All transactions |
| Transactions, Summary tab | Category by month totals |
| Transactions, Imports tab | Import history |
| Rules | Rules |
| Settings, Bank accounts tab | Accounts and import formats (admin) |

Screen states:

- **No bank accounts.** The Transactions screen explains that transactions come from bank accounts. Admins get "Add bank account". Staff see "Ask an admin to add a bank account".
- **Accounts but no imports.** Import call to action with a short note on downloading a CSV from the bank.
- **Inbox empty.** "All caught up" with the date of the last import per account.

## Sidebar and dashboard

- The Transactions sidebar item (01) shows a badge with the Needs review count.
- Dashboard card: "Transactions needing review", with a count per account, linking to the inbox.

## Edge cases

- **Bank changes its CSV columns.** Headers don't match the saved format, so the map step reappears with the old mapping pre-filled where columns still exist.
- **Credit card refund.** Comes in as money in on a credit card account. Categorized normally, usually to the same category as the original charge. Category totals net it out.
- **Same file uploaded to the wrong account.** Undo the import, then import to the right account.
- **Security deposit received or returned.** Categorized as Security Deposit (01), which is left out of all totals. Deposits aren't ledger entries (04 non-goals), so they aren't matched to a lease.
- **Abandoned upload** (file uploaded, preview never imported). The upload and its file are removed after 24 hours.
- **Deposit includes a tenant payment and a utility reimbursement.** Split in the match panel: payment to the lease plus an Other Income line.
- **Tenant pays two months in one deposit.** One payment for the full amount. The lease balance goes negative and the next month's charges use it up.
- **Rule matches but the transaction already has a manual line.** Rule is skipped.
- **Archived category on old transactions.** Lines keep it. Pickers hide it.
- **Account closed mid-year.** Its transactions still count in category totals and reconciliation.
- **Year is locked by 06.** Already-categorized rows dated in that year are read-only with a lock icon. New rows in that year can be categorized into non-recoverable categories or matched. Recoverable costs go to next year's reconciliation as a pool adjustment, or an admin reopens the year.

## Acceptance criteria

1. A property can have several bank accounts, and every transaction shows its account and belongs to its property.
2. The first import for an account requires mapping. Later imports with the same headers skip it.
3. Importing the same file twice adds nothing the second time. Importing an overlapping range adds only new rows, including correct handling of identical rows on the same day.
4. Rows that can't be read are listed with reasons and not imported.
5. A rule categorizes matching new transactions on import and never overrides a manual category.
6. Creating a rule from a manual categorization pre-fills pattern, direction, and account, and can apply to existing uncategorized matches.
7. A split must sum exactly to the transaction amount before saving.
8. Categorizing one side of a transfer suggests the other side, and paired transfers are excluded from category totals.
9. Confirming a deposit match creates ledger payments on the chosen leases and a Tenant Payment line together. Unmatching removes both.
10. Tenant Payment can't be chosen by hand or by a rule.
11. The Summary tab totals per category per month equal the sum of the lines behind each cell.
12. Undo is refused for an import with any matched, paired, or locked transaction.

## Open questions

1. Do you want bank reconciliation later: entering the statement ending balance and checking the portal agrees? It catches missing imports. It needs an opening balance per account.
2. Should rules be able to split a transaction across categories by percentage (for example, a utility bill that's 70% CAM and 30% owner)? This PRD assumes one category per rule.
3. Is 5 days the right window for finding the other side of a transfer?
