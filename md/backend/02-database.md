# Backend step 02 — Mongoose models and seed

**Depends on:** `01-setup.md`  
**Next:** `03-company.md`

## Goal

Atlas holds the company and the collections later steps write to. Line items are embedded on quotations and invoices.

## Collections

**companies**

- name, logoPath, signaturePath, gstNumber
- addressLine1, addressLine2, city, state, postalCode, country
- phone, email, website
- defaultCurrency, defaultHeader, defaultValidityDays
- defaultSalutation, defaultMessage, defaultClosing, defaultSignatory
- pdfClosingMessage, quotationTerms, invoicePaymentTerms
- quotationPrefix (`QUO`), invoicePrefix (`INV`)
- nextQuotationNumber, nextInvoiceNumber
- timestamps

**clients**

- companyId, name, gstNumber, phone, email, attentionName
- billingAddress, shippingAddress, city, state, postalCode, country, notes
- timestamps
- index: companyId + name

**categories**

- companyId, name, description, isActive, sortOrder, timestamps

**products**

- companyId, categoryId, name, sku, description, unit
- sellingPrice, costPrice, taxRate, imagePath, isActive, timestamps

**quotations**

- companyId, clientId, number, poSoNumber, header, currency
- quotationDate, validUntil, status
- companySnapshot, clientSnapshot
- salutation, message, closing, signatory, terms, notes, validityText
- items[] with name, description, sectionHeading, productId, categoryId, quantity, unit, unitPrice, discountAmount, taxRate, lineSubtotal, lineTotal, sortOrder
- subtotal, discountTotal, taxableAmount, taxTotal, additionalCharges, grandTotal
- convertedInvoiceId, archivedAt, timestamps
- unique index: companyId + number

**invoices**

- Same commercial fields as quotations, plus invoiceDate, dueDate, quotationId
- status, amountPaid, balanceDue, paymentTerms, notes, cancelledAt
- items[] in the same shape
- unique index: companyId + number

**payments**

- companyId, invoiceId, amount, paymentDate, method, reference, notes, timestamps

**documentFiles**

- companyId, documentType, documentId, path, version, generatedAt

## Steps

1. Add one Mongoose model per collection in `src/models/`.
2. Store money as strings with two decimal places, such as `"1500.00"`. Do all math with `decimal.js`. Do not use JavaScript floating-point for totals.
3. Add `Company.current()` that returns the single seeded company.
4. Seed that company with the values in `md/README.md`. Set `nextQuotationNumber` to `372` so the first number can be `QUO 372`.
5. Seed categories: Living Room, Kitchen, Bedroom, Civil Work, Electrical Work, Furniture, Custom Work.
6. Run the seed with `npm run seed`. It must be safe to run again without duplicating the company or categories.

## Do not add

- A users collection
- A separate items collection

## Done when

- `npm run seed` creates one company and seven categories in Atlas.
- `Company.current()` returns THE CONCEPT DESIGNERS.
- A script or temporary route can insert a quotation with one embedded item and read it back.
