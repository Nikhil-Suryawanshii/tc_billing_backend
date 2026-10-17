# Backend step 03 — Company settings API

**Depends on:** `02-database.md`  
**Next:** `04-clients.md`

## Goal

React can load and edit the one company, including logo and signature. PDF and forms read these values from MongoDB.

## Routes

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/company` | Current company |
| PUT | `/api/v1/company` | Update profile, defaults, prefixes, next numbers |
| POST | `/api/v1/company/logo` | Multipart image upload |
| POST | `/api/v1/company/signature` | Multipart image upload |
| GET | `/api/v1/company/defaults` | Form prefill only |

`defaults` returns header, currency, validity days, salutation, message, closing, signatory, PDF closing, quotation terms, and invoice payment terms.

## Steps

1. Validate phone, email, currency, and numeric next-number fields with a validator. Return `422` and an `errors` object.
2. Store uploads under `uploads/company/`. Save the public path on the company document. Delete the previous file when a new one is uploaded.
3. Return `logoUrl` and `signatureUrl` in the company JSON.
4. Wrap every response as `{ "data", "message" }`.

## Done when

- Changing the phone with `PUT /api/v1/company` shows up in `GET /api/v1/company`.
- Uploading a second logo replaces `logoPath` and removes the old file.
