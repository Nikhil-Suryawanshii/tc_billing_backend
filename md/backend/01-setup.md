# Backend step 01 — Node.js API and Atlas

**Depends on:** nothing  
**Next:** `02-database.md`

## Goal

An Express API that connects to MongoDB Atlas and answers a health check. No authentication.

## Steps

1. Create `backend/` as a Node.js project. Use the current Node 20 LTS or newer.
2. Install Express, Mongoose, CORS, dotenv, and nodemon.
3. Add `src/server.js`, `src/config/db.js`, and `src/routes/index.js`.
4. Add these keys to `.env` and `.env.example`. Leave the example values empty.

   - `PORT` — `5000`
   - `MONGODB_URI`
   - `MONGODB_DATABASE` — `the_concept_interior`
   - `CLIENT_ORIGIN` — `http://localhost:5173`

5. Put the real Atlas URI only in `.env`. Confirm `.env` is gitignored.
6. In Atlas, allow this machine’s IP. Use a database user that can read and write `the_concept_interior`.
7. Connect with Mongoose before the server starts listening. Log a clear error and exit if Atlas is unreachable.
8. Add `GET /api/v1/health`:

   ```json
   { "data": { "status": "ok" }, "message": "OK" }
   ```

9. Enable CORS for `CLIENT_ORIGIN`.
10. Create `uploads/` for logos, signatures, product images, and PDFs. Serve it as static `/uploads`.
11. Note in `backend/README`: Node version, `npm install`, Atlas IP allowlist, `npm run dev`.

## Do not add

- JWT, Passport, sessions, login routes, or auth middleware
- Laravel, PHP, MySQL, or Docker

## Done when

- `npm run dev` starts the API.
- `GET http://localhost:5000/api/v1/health` returns the JSON above.
- The console shows a successful Atlas connection.
