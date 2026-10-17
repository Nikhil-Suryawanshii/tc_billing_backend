# Backend step 04 — Clients API

**Depends on:** `03-company.md`  
**Next:** `05-catalog.md`

## Goal

Full client CRUD for the seeded company, plus a history endpoint later invoice code will fill.

## Routes

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/clients` | Search, paginate |
| POST | `/api/v1/clients` | Create |
| GET | `/api/v1/clients/{id}` | Show |
| PUT | `/api/v1/clients/{id}` | Update |
| DELETE | `/api/v1/clients/{id}` | Delete only when no quotation or invoice points at the client |
| GET | `/api/v1/clients/{id}/history` | Quotations, invoices, payments |

## Fields

name, gstNumber, phone, email, attentionName, billingAddress, shippingAddress, city, state, postalCode, country, notes.

`name` is required. Set `companyId` from `Company.current()` on create. Ignore any company id sent by the client.

## List behavior

- Query params: `search` (name, phone, email), `page`, `perPage`.
- Sort by name, then newest.
- Response meta: `currentPage`, `perPage`, `total`.

## History shape

```json
{
  "data": {
    "quotations": [],
    "invoices": [],
    "payments": []
  }
}
```

Return empty arrays until quotations and invoices exist. Step 07 must return real documents from this route.

## Done when

- Create, edit, search, and show work against Atlas.
- Delete returns `422` when a document references the client.
- An unknown id returns `404`.
