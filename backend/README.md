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

## Dashboard and reports

- `GET /api/v1/dashboard` returns company-scoped counts, balances, received
  payments, recent quotations and invoices, monthly revenue, conversion counts,
  and outstanding amounts by client.
- `GET /api/v1/reports/:slug?from=YYYY-MM-DD&to=YYYY-MM-DD` returns rows,
  summary values, and the selected range for `quotations`, `quotation-outcomes`,
  `conversion`, `sales`, `payments`, `outstanding`, `overdue`, `clients`,
  `products`, or `revenue`. Dates are optional; the default range is the latest
  12 calendar months through today. Invalid dates or unsupported parameters
  return HTTP 422.
- `GET /api/v1/reports/:slug/export` downloads the same filtered rows as CSV.
  Exports have headers even when no rows match and protect spreadsheet values
  that could otherwise be interpreted as formulas.

## Quotation and invoice PDFs

- `GET /api/v1/quotations/:id/pdf`
- `GET /api/v1/invoices/:id/pdf`

Both routes generate an A4 PDF from the saved document snapshots, return it as
an attachment, and save a versioned copy under `uploads/pdfs/` with a matching
`documentFiles` record. Generated PDFs are not served from the public uploads
route. PDF generation is unavailable on Vercel until persistent object storage
is configured because Vercel function filesystems are temporary.

## Vercel

Create a Vercel project with this directory as its Root Directory and select the
Express framework. Set Node.js to 22.x and configure `MONGODB_URI`,
and `MONGODB_DATABASE` in the Vercel project's environment variables.
`CLIENT_ORIGIN` can be added when the frontend is deployed. The deployed root
page checks Atlas connectivity; `/api/v1/health` checks that the API is running.

Vercel's filesystem is not persistent. Do not store uploaded files in `uploads/`
for production; move persistent uploads to object storage before adding upload
features.
