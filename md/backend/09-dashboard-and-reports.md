# Backend step 09 — Dashboard and reports

**Depends on:** `08-pdf.md`  
**Next:** start `md/frontend/01-setup.md`

## Goal

Every dashboard number comes from Atlas. This is the last backend step.

## Dashboard

`GET /api/v1/dashboard`

```json
{
  "data": {
    "clients": 0,
    "products": 0,
    "quotations": 0,
    "quotationsAccepted": 0,
    "quotationsPending": 0,
    "quotationsRejected": 0,
    "quotationsExpired": 0,
    "invoices": 0,
    "invoicesPaid": 0,
    "invoicesUnpaid": 0,
    "invoicesPartial": 0,
    "outstandingAmount": "0.00",
    "revenueReceived": "0.00",
    "recentQuotations": [],
    "recentInvoices": [],
    "monthlyRevenue": [],
    "conversion": { "accepted": 0, "rejected": 0, "converted": 0 },
    "outstandingSummary": []
  }
}
```

- Pending quotations are Draft + Sent.
- Unpaid invoices are Issued and Overdue with no payments.
- `revenueReceived` is the sum of payment amounts.
- `outstandingAmount` is the sum of `balanceDue` on invoices that are not Draft or Cancelled.
- `monthlyRevenue` is the last 12 months of payment totals: `{ "month": "2026-10", "amount": "0.00" }`.
- Recent lists return the latest 5 documents with id, number, client name, date, status, and total.

## Reports

`GET /api/v1/reports/{slug}?from=YYYY-MM-DD&to=YYYY-MM-DD`

| slug | Contents |
|---|---|
| quotations | Counts and totals by status |
| quotation-outcomes | Accepted, rejected, converted |
| conversion | Accepted quotations versus invoices created from them |
| sales | Issued invoice totals in the range |
| payments | Payments received in the range |
| outstanding | Open balances |
| overdue | Overdue invoices |
| clients | Sales, paid, and outstanding per client |
| products | Quantity and line totals per item name |
| revenue | Monthly rows inside the range, plus a yearly total |

Each money report includes issued sales, paid amount, and outstanding where those ideas apply.

`GET /api/v1/reports/{slug}/export` returns CSV for the same filter, with a header row.

## Done when

- With one accepted quotation, one converted invoice, and one partial payment, the dashboard counts and both money fields match that data.
- CSV export for `payments` downloads and includes the payment amount.
- Backend steps 01 through 09 are complete. React work starts at `md/frontend/01-setup.md`.
