# Backend step 06 — Quotations

**Depends on:** `05-catalog.md`  
**Next:** `07-invoices-and-payments.md`

## Goal

Create and manage quotations. The API assigns the number and the totals. A long description is one priced item.

## Routes

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/quotations` | List |
| POST | `/api/v1/quotations` | Create |
| GET | `/api/v1/quotations/{id}` | Show |
| PUT | `/api/v1/quotations/{id}` | Update, including a full replacement of `items` |
| POST | `/api/v1/quotations/{id}/duplicate` | New Draft with a new number |
| PATCH | `/api/v1/quotations/{id}/status` | Change status |
| DELETE | `/api/v1/quotations/{id}` | Archive (`archivedAt`) |

## List filters

`search` (number or client name), `status`, `clientId`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `sort`, `page`, `perPage`.

Default sort is newest quotation date. Archived documents stay out of the default list. `?archived=1` shows them.

## Create and update body

- `clientId`, or inline client fields when the customer is not saved yet. If those fields include a name and no `clientId`, create the client in the same request.
- poSoNumber, header, currency, quotationDate, validUntil
- salutation, message, closing, signatory, terms, notes, validityText
- additionalCharges
- items[]: name, description, sectionHeading, productId, categoryId, quantity, unit, unitPrice, discountAmount, taxRate, sortOrder

On create, copy company defaults into any message field the request omits. Store `companySnapshot` and `clientSnapshot` from the records at save time. Later company edits must not rewrite old snapshots.

## Totals

Use `decimal.js` in `src/services/totals.js`. For each item:

- line subtotal = quantity × unit price − discount
- line tax = line subtotal × tax rate, only when tax rate is present and greater than zero
- line total = line subtotal + line tax

Document:

- discountTotal = sum of line discounts
- subtotal = sum of (quantity × unit price) before discount, or document the chosen meaning in the service and use it everywhere
- taxableAmount = sum of line subtotals that have a tax rate
- taxTotal = sum of line tax
- grandTotal = sum of line totals + additionalCharges

Persist the results. Ignore any totals sent in the request body.

A section heading is a label on an item. It does not add a charge. Several sentences in `description` stay on that same item.

Use one definition in code:

- lineSubtotal = (quantity × unitPrice) − discountAmount
- subtotal = sum of lineSubtotal values before tax
- grandTotal = subtotal + taxTotal + additionalCharges

## Numbering

Read `nextQuotationNumber`, format `{prefix} {number}` (example `QUO 372`), save the quotation, then increment the counter. Use a MongoDB transaction so two overlapping creates cannot take the same number.

## Status

Allowed values: Draft, Sent, Accepted, Rejected, Expired, Converted.

- New quotations start as Draft.
- Converted is set only by the invoice step, not by this status route.
- A quotation with `convertedInvoiceId` cannot be edited.
- If `validUntil` is before today and status is Sent, show it as Expired.

## Done when

- A Living Room item with a multi-paragraph description is stored as one item with one price.
- Totals for a known sample match a hand calculation.
- Duplicate returns a new number and Draft.
- Two fast creates do not reuse one number.
