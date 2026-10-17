# Backend step 08 — PDF

**Depends on:** `07-invoices-and-payments.md`  
**Next:** `09-dashboard-and-reports.md`

## Goal

One A4 PDF built by Node for quotations and invoices. React only downloads the file.

Place `Mr Gujar Sir_QUO 372.pdf` in `docs/references/` and match its structure. Until that file is present, follow the layout below.

Use PDFKit in `src/services/pdf.js`. One layout function accepts a quotation or an invoice.

## Routes

| Method | Path |
|---|---|
| GET | `/api/v1/quotations/{id}/pdf` |
| GET | `/api/v1/invoices/{id}/pdf` |

Response is `application/pdf` with a filename like `QUO-372.pdf`. Also save the file under `uploads/pdfs/` and a `documentFiles` document. A new generate after an edit increments `version`.

## Layout

- A4, even margins, no overlapping columns.
- Header: logo on the left, document title on the right, then company name, address, phone, email, website when present. Use the document snapshot, not the live company row.
- Customer: To, name, address, GST when present.
- Document facts: date, number, P.O. / S.O. when present, grand total.
- Introduction: salutation, message, closing, signatory.
- Table columns: S.No., Item Details, Quantity, Price, Total.
- Repeat the header row on each page.
- Section heading prints in the item column and has no price of its own.
- Long descriptions wrap inside Item Details. One item can hold a full room specification.
- INR amounts use ₹.
- Totals: subtotal, discount only when discount total is not zero, tax only when tax total is not zero, additional charges only when not zero, grand total.
- Do not print a tax line of zero.
- Invoices also print amount paid, balance due, payment status, and due date.
- Footer: PDF closing message, validity text or payment terms, page number, a computer-generated notice, and the signatory.

## Done when

- A one-item quotation and a multi-page quotation with a long Living Room description both open in a PDF viewer.
- An invoice PDF shows a partial payment and the remaining balance.
- Both routes use `src/services/pdf.js`.
