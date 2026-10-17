# Backend

This is the Express API for THE CONCEPT DESIGNERS. It uses MongoDB Atlas through Mongoose.

## Requirements

- Node.js 20 or newer (Vercel project setting: Node.js 22.x)
- An Atlas database user with read/write access to `the_concept_interior`
- Atlas network access allowing this machine's current IP for local development

## Local setup

```bash
npm install
cp .env.example .env
```

Set `MONGODB_URI` in `.env` to the private Atlas connection URI. Do not commit `.env`.
The `MONGODB_DATABASE` default is `the_concept_interior`.

Start the API:

```bash
npm run dev
```

The server connects to Atlas before listening. If the connection fails, it logs the
error and exits. Check the connection at `http://localhost:5000/`; the API health
check at `http://localhost:5000/api/v1/health` returns:

```json
{ "data": { "status": "ok" }, "message": "OK" }
```

`CLIENT_ORIGIN` controls the single allowed CORS origin and defaults to
`http://localhost:5173`. The local `/uploads` directory is served at `/uploads`.
If port 5000 is already in use, set `PORT=5001` in `.env` and use port 5001 for
the URLs above. The server reports a clear error if the configured port is occupied.

## Database models and seed

The Mongoose models are in `src/models/`. Quotation and invoice line items are
embedded documents; money fields are stored as strings with two decimal places.
Use the helpers in `src/utils/money.js` for exact decimal arithmetic.

After `MONGODB_URI` is configured and Atlas access is allowed, initialize the
company and categories with:

```bash
npm run seed
```

The seed is safe to rerun: it reuses the earliest company and upserts the seven
default categories for it. `Company.current()` returns the earliest company.

## Company settings API

All company API responses use `{ "data": ..., "message": ... }`. Available routes:

- `GET /api/v1/company` returns company settings plus `logoUrl` and `signatureUrl`.
- `PUT /api/v1/company` updates editable profile, defaults, prefixes, and next numbers.
  Invalid values return HTTP 422 with an `errors` object.
- `GET /api/v1/company/defaults` returns only the values used to prefill forms.
- `POST /api/v1/company/logo` and `/api/v1/company/signature` accept multipart
  form data under the `file` field. JPEG, PNG, and WebP images up to 4 MB are
  accepted; a replacement removes the previous local image.

Company settings require a seeded company. Run `npm run seed` before using these
routes. Image uploads use local `uploads/company/` storage for development and
are intentionally unavailable on Vercel until persistent object storage is
implemented.

## Clients API

- `GET /api/v1/clients?search=...&page=1&perPage=20` searches by name, phone,
  or email. Results are scoped to the seeded company and include pagination
  metadata; `perPage` is capped at 100.
- `POST /api/v1/clients` creates a client. `name` is required and any submitted
  `companyId` is ignored.
- `GET`, `PUT`, and `DELETE /api/v1/clients/:id` show, update, and delete a
  client. Deletion returns HTTP 422 while any quotation or invoice references it.
- `GET /api/v1/clients/:id/history` returns the client's quotations, invoices,
  and associated payments.

Unknown or malformed client IDs return HTTP 404. Validation errors use HTTP 422
and include field-level details in `errors`.

## Categories and products API

- `GET/POST /api/v1/categories` lists categories (active first, then `sortOrder`)
  and creates them. `GET/PUT/DELETE /api/v1/categories/:id` manages a category;
  deletion returns HTTP 422 while products use it.
- `GET/POST /api/v1/products` lists or creates products. Product list filters
  support `search` (name/SKU), `categoryId`, and `isActive=true|false|all`;
  active products are listed by default. `GET/PUT/DELETE /api/v1/products/:id`
  manages a product. Inactive products remain available by ID.
- `POST /api/v1/products/:id/image` accepts a multipart `file` field containing
  a JPEG, PNG, or WebP image up to 4 MB. Locally the file is stored under
  `uploads/products/` and replaces the previous image. This upload is unavailable
  on Vercel until persistent object storage is implemented.

Prices are validated and stored as two-decimal strings; tax rates use decimal
strings. SKU uniqueness is enforced per company only for non-empty SKUs.

## Quotations API

- `GET/POST /api/v1/quotations` lists or creates quotations.
- `GET/PUT/DELETE /api/v1/quotations/:id` retrieves, updates, or archives one.
- `POST /api/v1/quotations/:id/duplicate` copies it into a new Draft.
- `PATCH /api/v1/quotations/:id/status` changes status. `Converted` is reserved
  for invoice conversion.

List filters include `search` (quotation number or client name), `status`,
`clientId`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `sort`, `page`,
`perPage`, and `archived=1`. Supported sort values are `newest` (default),
`oldest`, `amountAsc`, `amountDesc`, `numberAsc`, and `numberDesc`.

Create requests can use an existing `clientId` or provide inline client fields
including `name`. The service creates that client in the same transaction. The
server assigns quotation numbers and calculates all line/document totals using
`decimal.js`; client-supplied totals and document numbers are rejected. The
document subtotal is the sum of discounted line subtotals before tax; each tax
rate is a percentage, calculated and rounded per line. Quotation numbering uses
a MongoDB transaction, so the database must support transactions (Atlas does).
Sent quotations whose `validUntil` date is before today are presented as Expired.

## Invoices and payments API

- `GET/POST /api/v1/invoices` lists invoices or creates a Draft. List filters
  include `invoiceDateFrom`, `invoiceDateTo`, `dueDateFrom`, `dueDateTo`,
  `clientId`, `status`, `search`, `page`, and `perPage`.
- `GET /api/v1/invoices/:id` includes its payments. `PUT` updates Draft invoices
  only. `POST /api/v1/invoices/:id/issue` issues a draft; `/cancel` cancels an
  invoice without removing its data or payment history.
- `POST /api/v1/quotations/:id/convert` converts an Accepted quotation once,
  creating an Issued invoice and linking both documents in one transaction.
- `GET /api/v1/payments` lists payments and supports `clientId`, `invoiceId`,
  `dateFrom`, and `dateTo` filters. `GET/POST /api/v1/invoices/:id/payments`
  reads or records invoice payments. `DELETE /api/v1/payments/:id` removes a
  payment and recalculates its invoice in a transaction.

Invoice numbers are allocated transactionally. Payments must be positive and
not exceed the outstanding balance. Status changes follow the balance and due
date; cancelled invoices keep their payment records. Client history includes
payments even for cancelled invoices.

## Quotation and invoice PDFs

- `GET /api/v1/quotations/:id/pdf`
- `GET /api/v1/invoices/:id/pdf`

Both endpoints generate an A4 PDF with PDFKit, return it as an attachment, save
versioned files below `uploads/pdfs/`, and record the current version in
`documentFiles`. PDFs use the company/client snapshots saved on the document.
The bundled DejaVu Sans font includes the rupee glyph. Generated PDFs are not
served through the public `/uploads` static route.

These endpoints return HTTP 503 on Vercel until persistent object storage is
implemented. Vercel function filesystems are temporary; saving a generated PDF
there would falsely imply that it is retained.

## Dashboard and reports

- `GET /api/v1/dashboard` returns company-scoped counts, invoice balances,
  received payments, recent quotations/invoices, monthly revenue, conversion
  counts, and outstanding balances by client.
- `GET /api/v1/reports/:slug?from=YYYY-MM-DD&to=YYYY-MM-DD` returns rows and
  summary data for `quotations`, `quotation-outcomes`, `conversion`, `sales`,
  `payments`, `outstanding`, `overdue`, `clients`, `products`, or `revenue`.
  Dates are optional; the default range is the latest 12 calendar months through
  today. Invalid date values return HTTP 422.
- `GET /api/v1/reports/:slug/export` downloads the same filtered rows as CSV.
  Exports include headers even when a report has no rows.

## Vercel

Create a Vercel project with this directory as its Root Directory and select the
Express framework. Set Node.js to 22.x and configure `MONGODB_URI`,
and `MONGODB_DATABASE` in the Vercel project's environment variables.
`CLIENT_ORIGIN` can be added when the frontend is deployed. The deployed root
page checks Atlas connectivity; `/api/v1/health` checks that the API is running.

Vercel's filesystem is not persistent. Do not store uploaded files in `uploads/`
for production; move persistent uploads to object storage before adding upload
features.
