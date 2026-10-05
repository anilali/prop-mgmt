# 03. Lease documents

Depends on: 02 (tenants and leases). Used by: 06 (saves statements as documents).

## Summary

Let a lease hold many documents instead of one PDF: the signed lease, amendments, extensions, insurance certificates, guaranties, estoppels, notices, and year-end statements. Each document has a type and optional dates. Insurance certificates have an expiry date, and the portal shows which active leases are missing a current one. A property-wide Documents screen lists everything with search, filters, preview, and bulk upload.

## Problem

- A lease has one document slot. Uploading a new file replaces and deletes the old one, so an amendment overwrites the signed lease.
- Commercial leases require tenants to carry insurance and provide a certificate (COI) each year. Nothing tracks whether one is on file or when it expires.
- Uploads are slow, and large files can't be uploaded.
- There's no place to find "every amendment on this property" or "the estoppel we sent last spring".

## Goals

- Every file related to a lease is stored, typed, and findable in two clicks.
- An operator can see in one view which active leases have no current insurance certificate.
- Uploading ten files at once takes one drop and a quick review.
- No file is lost by accident.

## Non-goals

- E-signature.
- Generating documents from templates, except statements produced by 06.
- Reading data out of documents (OCR, extracting dates from a COI). See "Later: AI pre-fill" below.
- Tenant-facing document access. See the open questions in the README.
- Documents attached to things other than leases (vendor contracts, property deeds).

## Users and permissions

| Action | Staff | Admin |
|---|---|---|
| View, preview, and download documents | yes | yes |
| Upload documents and edit their details | yes | yes |
| Archive and unarchive | yes | yes |

There is no hard delete for anyone. A wrongly uploaded file is archived. If a file must be purged (for example, it contains someone else's private data), that's a manual operation by a platform admin outside the app.

## Glossary

- **Document.** One stored file with a type, title, dates, and the leases it belongs to.
- **Document type.** What the file is. Drives filters, compliance checks, and which dates are required.
- **Current insurance certificate.** An insurance certificate linked to the lease, not archived and not superseded, that expires today or later.
- **Superseded.** A document replaced by a newer one of the same type. Kept, shown under the newer one.

## User stories

- As an operator, I drop the signed lease, two amendments, and a COI onto a lease's Documents tab and set their types in one review step.
- As an operator, I see which active leases have no current insurance certificate, and upload the new one from that list.
- As an operator, I upload one COI that covers a tenant's two leases, once.
- As an operator, I replace last year's COI with this year's, and the old one stays in history.
- As an operator, I preview a PDF without downloading it.
- As an operator, I find every amendment on the property by filtering by type.
- As an operator, I see a lease's year-end statements next to its other documents.

## Document types

| Type | Effective date | Expires on | Notes |
|---|---|---|---|
| Lease | optional | optional | The signed lease |
| Amendment | recommended | optional | |
| Extension | recommended | optional | Often uploaded when an option is exercised (02) |
| Insurance certificate | optional | required | Drives compliance |
| Guaranty | optional | optional | |
| Estoppel | recommended | optional | |
| Notice | recommended | optional | Letters sent or received |
| Statement | set automatically | none | Created by 06 only. Can't be uploaded by hand, and its details can't be edited |
| Other | optional | optional | |

"Recommended" means the review step highlights the empty field but doesn't block saving.

When both dates are set, the expiry date can't be before the effective date.

A document belongs to one tenant. It links to one or more of that tenant's leases on the property, and always to at least one.

## Upload flow

1. **Drop.** The operator drops one or more files on the Documents tab of a lease, or on the Documents screen. Files that aren't an allowed type or are over the size limit are rejected right away with the reason.
2. **Upload.** Files upload in parallel with a progress bar each. Failures can be retried one at a time.
3. **Review.** A table with one row per file:
   - Lease(s). Pre-filled when uploading from a lease. On the Documents screen, a picker that groups leases by tenant. Picking a tenant with several active leases offers "all of this tenant's active leases".
   - Type. Guessed from the file name ("COI", "certificate" → insurance certificate; "amendment", "amend" → amendment; "estoppel"; "guaranty", "guarantee"), otherwise empty and required.
   - Title. Defaults to the file name without extension.
   - Effective date, expires on.
   - "Replaces". For insurance certificates, defaults to the lease's current certificate, if any.
   - For extension and amendment rows on a lease with a renewal marked "Document missing" (02): "This is the document for the renewal on {date}", checked by default when there's exactly one such renewal.
4. **Save.** Confirms all rows at once. Rows with missing required fields block the save and are highlighted. A file that didn't finish uploading, or whose type doesn't match what was dropped, is rejected.
5. **Follow-up for amendments and extensions.** After saving, each amendment or extension not attached to a renewal gets "Update lease terms from this document". Admins go to the lease's Terms tab with the document preselected as the source for their changes (02). For staff, the document is saved and admins see a dashboard item, "Amendment uploaded, terms not updated", until an admin updates terms with it as the source or dismisses the item. Lease PDFs carried over from the old single-document slot never show this item.

Allowed types: PDF, PNG, JPEG, WebP. Size limit: 25 MB per file.

Files that are uploaded but never saved in the review step are removed after 24 hours.

## Replacing a document

"Replace" on a document opens the upload flow for one file with the same lease links and type, and "Replaces" set. A document can only replace one of the same type that shares at least one lease with it. On save, the old document is marked superseded by the new one. Superseded documents:

- don't count as current for compliance
- are hidden from the default list and shown in a "Previous versions" expander under the document that replaced them

Any document can be replaced, but it's mostly used for insurance certificates.

## Screens

### Lease Documents tab

A list grouped by type, with the newest first in each group. Each row shows title, type, effective date, expiry (red when past, amber within 60 days), uploaded by and when, and actions: Preview, Download, Replace, Edit details, Archive.

At the top, a compliance line: "Insurance certificate current until Mar 31, 2027" or "No current insurance certificate" with an upload button.

Empty state: a drop area with "Drop the signed lease, amendments, or insurance certificates here".

### Documents screen

All documents on the property in a table.

- Columns: title, type, tenant, lease (unit), effective date, expires on, uploaded.
- Search across title and file name.
- Filters: type, tenant, lease, "expires within", show archived, show superseded.
- Bulk upload by dropping onto the page.
- Views as tabs:
  - **All.** The table above.
  - **Compliance.** One row per active lease: tenant, unit, current certificate's expiry, status. Sorted with missing and expired first. Each row has an "Upload certificate" action that opens the upload flow pre-filled for that lease.

A lease's compliance status uses the latest expiry among its current insurance certificates:

| Status | When |
|---|---|
| Missing | No certificate on file that is not archived or superseded |
| Expired | The latest expiry is before today |
| Expiring | The latest expiry is within 60 days |
| Current | Otherwise |

The 60-day window is the same for every property for now. It could become a property setting later.

### Preview

Clicking a row opens a side panel with the file rendered inline (PDF viewer or image) and its details beside it. Arrow keys move to the next and previous document in the current list.

Downloads use the file's original name.

### Archive

"Archive" asks for confirmation and an optional reason. Archived documents are hidden unless "show archived" is on, and can be unarchived. Archiving a current insurance certificate shows that the lease will become non-compliant.

## Dashboard card

"Insurance certificates": count of active leases whose status is missing, expired, or expiring. Links to the Compliance tab.

## Existing lease PDFs

Each lease's existing PDF becomes a signed lease document linked to that lease, with its original upload date and the same file.

## Edge cases

- **Files uploaded but never saved** (tab closed). The files are removed after 24 hours.
- **Archiving a document used as a term source or renewal document.** Allowed. The terms history still links to it, labeled "Archived". The renewal doesn't go back to "Document missing".
- **Wrong document attached to a renewal.** An admin picks a different document from the renewal row in the terms history. The change is kept in the lease's history.
- **A file didn't finish uploading but the operator saves.** Save rejects that row with "Upload didn't finish" and the operator retries.
- **Same file uploaded twice.** Allowed. The portal doesn't dedupe by content.
- **COI covers two leases and one ends.** The document stays linked to both. Compliance only checks active leases.
- **Lease is ended.** Its documents stay and remain visible. It drops out of the Compliance view. New documents can still be uploaded to it, since termination notices and final statements arrive after a lease ends. This is an exception to 02's rule that ended leases can't be changed.
- **Unlinking the last lease from a document.** Rejected. Archive the document instead.
- **Preview left open for a long time stops loading.** Reopening the preview loads it again.

## Later: AI pre-fill

Not in this PRD. Noted because the design should leave room for it.

Entering terms from a long lease by hand is the slowest part of onboarding a property. A later PRD could add "Pre-fill from document" to the create-lease form (02), the renew form, and the Terms tab. A model reads the selected lease, amendment, or extension document and proposes values: dates, rent steps, recoveries and estimates, flat charges, options. For insurance certificates, it proposes the expiry date.

Rules that keep this safe, and that this PRD's design already supports:

- **Proposals only.** Every proposed value lands in the normal form, marked as suggested, with the page and passage it came from. Nothing saves without an admin confirming it.
- **The terms stay the source of truth for billing.** The document stays the legal record. Each term records the document it came from (02), set to the document the proposal came from.
- **Extracted text isn't stored as rules.** Extraction fills the existing lease term fields. Clauses with no matching field (exclusions, caps) are shown as notes for the admin.

What 03 provides for it today: typed documents linked to leases, a review step after upload, and an inline preview for showing the source passage beside a proposed value.

## Acceptance criteria

1. A lease can have any number of documents. Uploading a new one never removes an old one.
2. Dropping five files uploads them all, and the review step requires a type for each before saving.
3. An insurance certificate can't be saved without an expiry date.
4. The Compliance view lists every active lease with the correct status, and a lease with only a superseded or archived certificate shows as missing.
5. Replacing a certificate marks the old one superseded and shows it under "Previous versions".
6. One certificate linked to two leases counts for both in Compliance.
7. Preview renders PDFs and images inline without downloading.
8. Archived documents are hidden by default, shown with a filter, and can be unarchived. Nothing in the app deletes a file.
9. Existing lease PDFs appear as lease documents, using the same stored file.
10. Files uploaded but not saved within 24 hours are removed.
11. Uploading an extension to a lease with one renewal marked "Document missing" attaches it to that renewal by default and clears the flag.
12. An amendment uploaded by staff and not used as a term source shows on the admin dashboard until an admin updates terms with it or dismisses it.

## Open questions

1. Should expiring certificates trigger an email to the tenant's primary contact, or only show on the dashboard? Email depends on the provider decision in the README.
2. Is 60 days the right warning window for certificates?
3. Should some document types (statements, notices) be shareable to the tenant portal later? If yes, a "visible to tenant" setting is cheap to add now.
