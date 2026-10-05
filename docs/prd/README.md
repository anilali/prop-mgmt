# Commercial property operations: PRD set

The platform manages commercial properties only. These PRDs add the money side of running them to the operator portal, plus lease document management. Today the portal has units, tenants, and leases with one rent amount and one PDF. The ideas come from a reconciliation spreadsheet the owner uses now. The flows are designed for an app and do not copy the spreadsheet.

The first user is one owner with a few properties. Other operators should be able to use the portal later, so anything that differs between properties (categories, cost pools, bank accounts, import formats) is configuration, not code.

## The PRDs

| # | PRD | What it covers | Depends on |
|---|---|---|---|
| 01 | [Navigation and property setup](./01-navigation-and-property-setup.md) | Sidebar, Settings, property addresses, units (and removing residential fields), categories, cost pools, dashboard | nothing |
| 02 | [Commercial leases](./02-commercial-leases.md) | Tenant contacts, rent schedules, recoveries, flat charges, options, lease creation and detail | 01 |
| 03 | [Lease documents](./03-lease-documents.md) | Many documents per lease, types, expiry, compliance view | 02 |
| 04 | [Billing and rent roll](./04-billing-and-rent-roll.md) | Charges, charge runs, payments, ledger, rent roll | 01, 02 |
| 05 | [Bank accounts and transactions](./05-bank-accounts-and-transactions.md) | Bank accounts, CSV import, review inbox, rules, transfers, deposit matching | 01, 04 |
| 06 | [Year-end reconciliation](./06-year-end-reconciliation.md) | Actual costs, per-lease split, statements, finalize, next year's estimates, room for exclusions and caps | 02, 04, 05 |
| 07 | [Operator assistant](./07-operator-assistant.md) | Ask in plain language, answer follow-up questions, get a change plan that opens pre-filled forms | 01, 02 |

Build order follows the table. Each PRD ships something useful on its own. 03 can run in parallel with 04. 07 can start any time after 02. It plans only the actions that have shipped, and each later PRD adds its own.

## How the pieces connect

The leases are triple net (NNN). A tenant pays base rent plus a monthly estimate toward the property's shared costs: common area maintenance (CAM), real estate tax, insurance, water. Once a year the owner compares what the property actually spent with what each tenant paid in estimates, and bills or credits the difference.

```text
 Settings (01)                 Leases (02)                Bank accounts (05)
 units, categories,            rent steps, which          CSV imports
 cost pools                    pools a lease pays,        |
     |                         estimates, flat charges    v
     |                             |                   Transactions (05)
     |                             v                   categorized spending,
     |                       Charge run (04)           matched deposits
     |                             |                        |        |
     |                             v                        |        |
     |                        Lease ledger (04) <--payments-+        |
     |                             |                                 |
     +------------------------> Reconciliation (06)  <---actual costs
                                   |
                                   v
                 statement per lease (saved as a document, 03),
                 reconciliation charge (04), next year's estimates (02)
```

## Shared glossary

Each PRD adds terms of its own. These are used across all of them.

- **Property.** A building or center the operator runs. Everything below is scoped to one property.
- **Unit.** A rentable space with a label, an address, and an area in sqft that can change over time.
- **Tenant.** A business or person that leases one or more units.
- **Lease.** An agreement between one tenant and one unit for a date range.
- **Category.** A label for money moving in or out, configured per property. Example: CAM.
- **Recoverable category.** A category of cost that tenants pay back a share of.
- **Cost pool.** A recoverable category plus the rule for splitting it across units.
- **Pro rata share.** A unit's fraction of a cost pool, by area.
- **Recovery.** A lease's agreement to pay into one cost pool, with a monthly estimate.
- **Charge.** An amount a lease owes.
- **Payment.** Money received for a lease.
- **Ledger.** All charges, payments, and adjustments on one lease.
- **Bank account.** An account a property uses. A property has one or more.
- **Transaction.** One line imported from a bank account.
- **Reconciliation.** The yearly comparison of actual pool costs with estimates billed, per lease.

## Principles every PRD follows

1. **Property scoping.** An operator only sees and changes data for the property they're working in. Anything from another property behaves as if it doesn't exist.
2. **Money is exact to the cent.** Amounts never pick up fractions of a cent along the way.
3. **Shares are computed, not stored.** Pro rata shares are worked out from unit areas each time they're needed. Rounding happens once per final line, to the cent, with halves rounded away from zero.
4. **Money records are never edited.** Posted charges, payments, and imported transactions stay as they are. Corrections are new linked records. The one exception, unmatching a deposit, is covered in 05 and blocked once a year is reconciled.
5. **Accounting dates have no time of day.** Charge periods, payment dates, and transaction dates are plain dates. A charge period is the first day of its month.
6. **Duplicates are impossible, not just discouraged.** Rules like "one charge run per month" always hold, even when two people act at once.
7. **Every change records who made it.** This history backs the history views (lease terms in 02, who posted or finalized what in 04 and 06). There is no separate activity screen.
8. **Configuration over code.** Category lists, pool rules, import formats, and categorization rules are settings a property edits.
9. **Actions can be planned by the assistant.** Once 07 ships, every new action an operator can take also ships so the assistant can include it in a plan and open its form pre-filled.

## Permissions

Each property has two roles. Staff do the daily work: charge runs, payments, imports, categorizing, documents, and draft leases. Staff also update estimates after reconciliation. Admins activate leases and change their other terms, change settings that affect every tenant, and close out a year. Each PRD lists its own actions.

## Out of scope for the whole set

- Live bank feeds such as Plaid. CSV import only.
- Tenants paying through the tenant portal.
- Owner-level items: mortgage, distributions, owner profit and loss.
- Double-entry bookkeeping and a chart of accounts.
- Per-lease exclusions, caps, admin fees, and gross-up. 06 designs room for them.
- Automatic late fees.
- Residential properties. The platform is commercial only, and 01 removes the residential fields units have today.

## Open questions that affect several PRDs

1. **Email delivery.** 03 (expiry reminders) and 06 (sending statements) want email. The repo has no email provider. Pick one before 06, or ship download-only first.
2. **Tenant portal.** Should tenants see their ledger, statements, and documents? Cheap once 04 exists, but it changes what operators write in memos.
3. **Fiscal year.** Reconciliation assumes a calendar year. Do any leases reconcile on a different year?
