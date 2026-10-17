# Build plan

Finish the Node.js API before starting React. Do the next file only after the previous file’s “Done when” checks pass.

```text
md/backend/01  →  09     Node.js + Express + MongoDB Atlas
md/frontend/01 →  09     React dashboard, after the API is complete
```

## Stack

| Part | Choice |
|---|---|
| API | Node.js, Express, Mongoose |
| Database | MongoDB Atlas |
| Web app | React, Vite, React Router, Axios |
| Styling | Tailwind CSS |

Not used: Laravel, PHP, Flutter, MySQL, Docker, login, or JWT.

## No login

This system is for personal use.

- There is no login, logout, forgot password, role, or permission screen.
- Routes under `/api/v1` are open. Do not add auth middleware.
- React’s first page is the dashboard.
- One company record is seeded. Every document belongs to that company.
- Company settings are editable in React and are not hardcoded into screens or the PDF.

## What each app owns

| Work | Where |
|---|---|
| Save clients, products, quotations, invoices, payments | Node.js |
| Quotation numbers, invoice numbers, totals, statuses | Node.js |
| PDF file | Node.js |
| Forms, lists, dashboard, print, download | React |

React may show a total preview while typing. After save, it shows the totals returned by the API.

## Folders

```text
backend/     Express API
frontend/    React dashboard
md/          this plan
```

## Company seed

| Setting | Value |
|---|---|
| Name | THE CONCEPT DESIGNERS |
| Address line 1 | Plot 127, Siddhivinayak Township, Hirawadi |
| Address line 2 | Nashik, 422003, India |
| Phone | 9860416153 |
| Email | shashankss08@gmail.com |
| Currency | INR |
| Header | Quotation |
| Validity | 7 days |
| Salutation | Dear Client, |
| Message | Please find below a cost-breakdown for the quotation. Please consider this, and do not hesitate to contact me with any question. |
| Closing | Many thanks, |
| Signatory | THE CONCEPT DESIGNERS |
| PDF closing | Many thanks for your custom! I look forward to doing business with you. |
| PDF terms | Quotation terms: Valid up to 7 days. |

## Statuses

- Quotation: Draft, Sent, Accepted, Rejected, Expired, Converted
- Invoice: Draft, Issued, Partially Paid, Paid, Overdue, Cancelled

Paid and Partially Paid come from payment records. An accepted quotation can be converted once.
