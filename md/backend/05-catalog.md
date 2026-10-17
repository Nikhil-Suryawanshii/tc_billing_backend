# Backend step 05 — Categories and products

**Depends on:** `04-clients.md`  
**Next:** `06-quotations.md`

## Goal

A catalog React can search while building a document. Custom quotation lines do not need a product row.

## Category routes

| Method | Path |
|---|---|
| GET, POST | `/api/v1/categories` |
| GET, PUT, DELETE | `/api/v1/categories/{id}` |

Fields: name, description, isActive, sortOrder. List active categories first, ordered by `sortOrder`. Deleting a category that products still use returns `422`.

## Product routes

| Method | Path |
|---|---|
| GET, POST | `/api/v1/products` |
| GET, PUT, DELETE | `/api/v1/products/{id}` |
| POST | `/api/v1/products/{id}/image` |

Fields: name, sku, description, categoryId, unit, sellingPrice, costPrice, taxRate, isActive.

## List behavior

- `search` matches name and sku.
- `categoryId` and `isActive` filter the list.
- Inactive products stay readable by id so old documents can still show the name. The default list is active only. Pass `isActive=all` to see both.

## Steps

1. Prices and tax rate use the same decimal strings as step 02.
2. Image upload is stored under `uploads/products/`.
3. SKU is unique per company when it is not empty. Empty SKU is allowed.

## Done when

- The seven seeded categories appear from `GET /api/v1/categories`.
- Creating a product with a selling price of `1999.50` returns `"1999.50"`.
- Search by a partial name returns that product.
