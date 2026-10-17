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

## Vercel

Create a Vercel project with this directory as its Root Directory and select the
Express framework. Set Node.js to 22.x and configure `MONGODB_URI`,
`MONGODB_DATABASE`, and `CLIENT_ORIGIN` in the Vercel project's environment
variables. The deployed root page checks Atlas connectivity; `/api/v1/health`
checks that the API is running.

Vercel's filesystem is not persistent. Do not store uploaded files in `uploads/`
for production; move persistent uploads to object storage before adding upload
features.
