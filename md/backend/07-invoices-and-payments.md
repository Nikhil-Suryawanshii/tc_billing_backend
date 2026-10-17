# Backend step 07 — Invoices and payments

**Depends on:** `06-quotations.md`  
**Next:** `08-pdf.md`

## Goal

Invoices use the same item and total rules as quotations. Payment documents decide Partially Paid and Paid. Conversion from an accepted quotation happens once.

## Invoice routes

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/invoices` | List |
| POST | `/api/v1/invoices` | Create draft |
| GET | `/api/v1/invoices/{id}` | Show, including payments |
| PUT | `/api/v1/invoices/{id}` | Update a Draft only |
| POST | `/api/v1/invoices/{id}/issue` | Draft → Issued |
| POST | `/api/v1/invoices/{id}/cancel` | Set Cancelled, keep items and payments |
| POST | `/api/v1/quotations/{id}/convert` | Create invoice from an Accepted quotation |

## Payment routes

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/payments` | All payments, filter by client, invoice, date |
| GET | `/api/v1/invoices/{id}/payments` | One invoice |
| POST | `/api/v1/invoices/{id}/payments` | Record a payment |
| DELETE | `/api/v1/payments/{id}` | Remove and recalculate |

## List filters

Invoice date range, due date range, `clientId`, `status`, search by number or client name, pagination.

## Create

Same item payload and `totals.js` service as quotations. Invoice number uses `invoicePrefix` and `nextInvoiceNumber` inside a transaction. Required: client, invoiceDate, dueDate, items. Status starts as Draft. `amountPaid` is `"0.00"`. `balanceDue` equals `grandTotal`.

Issued, Partially Paid, Paid, Overdue, and Cancelled invoices reject `PUT`. Cancel keeps the document readable.

## Conversion

1. Quotation status must be Accepted.
2. If `convertedInvoiceId` is set, return `422`.
3. Copy snapshots, items, prices, discounts, taxes, notes, and currency.
4. Create the invoice as Issued, store `quotationId`, set the quotation to Converted, and store `convertedInvoiceId`.
5. Do this in one transaction.
6. Later invoice edits must not change the quotation.

## Payments

- Amount must be greater than zero and no greater than `balanceDue`.
- `amountPaid` is the sum of payment documents. `balanceDue` is grandTotal − amountPaid.
- Status becomes Partially Paid when amount paid is between zero and the grand total, and Paid when the balance is zero.
- An Issued or Partially Paid invoice whose due date is before today and whose balance is above zero is Overdue.
- Cancelled invoices reject new payments.

## Client history

`GET /api/v1/clients/{id}/history` returns that client’s quotations, invoices, and payments.

## Done when

- Converting the same quotation twice fails the second time.
- A partial payment, then a second payment that clears the balance, ends as Paid with balance `"0.00"`.
- Cancelling an invoice still returns its old payments from the history route.
