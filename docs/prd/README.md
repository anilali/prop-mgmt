# Commercial property operations: PRD set

The platform manages commercial properties only. These PRDs add the money side of running them to the operator portal, plus lease document management. Today the portal has units, tenants, and leases with one rent amount and one PDF. The ideas come from a reconciliation spreadsheet the owner uses now. The flows are designed for an app and do not copy the spreadsheet.

The first user is one owner with a few properties. Other operators should be able to use the portal later, so anything that differs between properties (categories, cost pools, bank accounts, import formats) is configuration, not code.

## The PRDs

| # | PRD | What it covers | Depends on |
|---|---|---|---|
| 01 | [Navigation and property setup](./01-navigation-and-property-setup.md) | Sidebar, Settings, units (and removing residential fields), categories, cost pools, dashboard | nothing |
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
- **Unit.** A rentable space with a label and an area in sqft.
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

## Context map

```text
             Property  (properties, units, categories, cost pools)
                 ^
                 | propertyId, unitId, categoryId, poolId
                 |
  TenantMgmt     |      LeaseMgmt                   Banking
  (tenants,  <---+----  (leases, rent schedule,     (bank accounts, imports,
   contacts,            recoveries, flat charges,    transactions, rules)
   bank aliases)        options, documents)                |
                              |                            | category totals,
                              | lease terms                | deposit facts
                              v                            v
                           Billing  (charges, payments, charge runs,
                                     reconciliations)
```

- **Property** gains categories and cost pools, and units lose their residential fields. It does not know about leases.
- **TenantMgmt** gains contacts, a mailing address, and bank aliases.
- **LeaseMgmt** owns everything written in the lease, including documents.
- **Banking** is new, in `packages/contexts/banking`, persisted in a new `banking` Postgres schema.
- **Billing** fills the existing stub in `packages/contexts/billing` and the empty `billing` schema. It is the only context that computes balances.
- Contexts refer to each other by id only. When a flow spans contexts (confirming a deposit match creates a payment), an application service in `packages/api/operator` coordinates it, the same way lease creation checks the unit and tenant today.

## Principles every PRD follows

1. **Property scoping.** Every read and write takes `propertyId` from request context, as in `docs/operator-access.md`. An id from another property returns not found.
2. **Money is integer cents.** Stored as `bigint`. No floats anywhere in calculation or storage.
3. **Shares are computed, not stored.** Pro rata shares come from integer sqft at calculation time. Rounding happens once per final line, to the cent, half away from zero.
4. **Money records are append-only.** Posted charges, payments, and imported transactions are never edited. Corrections are new linked records. The one exception, unmatching a deposit, is covered in 05 and blocked once a year is reconciled.
5. **Accounting dates are date-only.** Charge periods, payment dates, and transaction dates are `date` columns with no time zone. A charge period is the first day of its month.
6. **The database enforces uniqueness.** Rules like "one charge run per month" are unique constraints, not only code checks.
7. **Every write emits a domain event** with the acting operator's `authUserId`. Events back the history views (lease terms history in 02, who posted or finalized what in 04 and 06). There is no separate activity screen.
8. **Configuration over code.** Category lists, pool rules, import formats, and categorization rules are data a property edits.
9. **Writes are plannable.** Once 07 ships, every new user-facing write ships with an entry in the assistant's action catalog: the mutation's Zod schema, the form route, and a dry-run check. Its mutation accepts an optional `planStepId`, and its form accepts the `planStep` search parameter.

## Permissions

Roles are the existing `admin` and `staff` from `docs/operator-access.md`. Staff do the daily work: charge runs, payments, imports, categorizing, documents, and draft leases. Admins also activate leases and change their terms, change settings that affect every tenant, and close out a year. Each PRD lists its own actions. Admin-only actions use a new `propertyAdminProcedure` in `packages/api/operator/src/trpc.ts` that extends `propertyProcedure` with a role check.

## New shared infrastructure

| What | Added by | Used by |
|---|---|---|
| `propertyAdminProcedure` | 01 | 01, 02, 05, 06 |
| Signed upload URLs and `headObject` on `BlobStorage`, bucket CORS | 03 | 03, 05 |
| A daily cron route in the operator portal (Vercel Cron) | 03 | 03, 05 |
| `packages/infrastructure/pdf` on `@react-pdf/renderer` | 06 | 04, 06 |
| `packages/infrastructure/llm` on the Vercel AI SDK and AI Gateway | 07 | 07, later the AI pre-fill in 03 |
| A streaming route handler that builds the tRPC request context | 07 | 07 |

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
