# Deploy THE CONCEPT DESIGNERS on Vercel

This guide deploys the React app and Express API as **two Vercel projects** from this repository. MongoDB Atlas remains the database.

The `backend/` and `frontend/` folders are siblings. Create two Vercel projects from the same Git repository: set the backend project's Root Directory to `backend` and the frontend project's Root Directory to `frontend`. Do not deploy this repository root as either app.

```text
Browser → React app on Vercel → Express API on Vercel → MongoDB Atlas
                                      ↕
                                 Vercel Blob
```

## Important: prepare the app before deploying

The current local setup writes images and PDFs under `backend/uploads/`. Vercel Functions have a read-only filesystem except for temporary `/tmp` storage, and Express `express.static()` does not serve files on Vercel. Files written to a function's temporary storage are not persistent. Do not deploy the current disk-based upload/PDF storage and expect files to remain available.

Before deploying, make these changes:

1. **Move persistent files to object storage.** Use Vercel Blob (or another persistent object store) for company logos, signatures, product images, and generated PDFs. Store the Blob URL or pathname in MongoDB. Use temporary `/tmp` only while generating a PDF, then upload it to Blob. Replace the local-file deletion and `/uploads` serving paths with Blob operations.
2. **Choose Blob access deliberately.** Product images and logos can use a public Blob store. Use a separate private Blob store for quotations and invoices, and stream/download those through the API. Private Blob files require server-side access; public Blob files can be opened by anyone who has the URL.
3. **Check existing upload files.** Move any existing PDFs/images that must be kept into persistent storage before excluding local uploads. Make sure private PDFs and `.env` files are not tracked in Git or included in a deployment. Add `uploads/**` to `backend/.vercelignore` once needed files have been migrated.
4. **Make PDF fonts Linux-compatible.** The PDF generator currently refers to fonts under `/System/Library/Fonts`, which is a macOS path and will not exist in Vercel's Linux runtime. Bundle appropriately licensed font files in `backend/assets/` and point the PDF generator to those files. Include a font with the rupee glyph so `₹` renders correctly.
5. **Keep function startup free of local server work.** The backend exports its Express app for Vercel and only creates upload folders or calls `app.listen()` during local development. Vercel connects to MongoDB when an API route needs it. If the PDF generator needs a temporary file, use `/tmp` and then upload it to Blob.
6. **Check upload payload limits.** The current image upload limit is 5 MB, while Vercel Function request and response bodies are limited to 4.5 MB. Lower the server upload limit or change to direct-to-Blob client uploads.
7. **Keep the API private if it will contain real client data.** This app currently has no login and its `/api/v1` routes are open. A public Vercel URL therefore exposes the API to anyone who can reach it. Add authentication or configure access protection before storing real client or financial records.

These are application changes, separate from Vercel dashboard configuration. Vercel's Express deployment does not make the local upload folder persistent.

## 1. Prepare MongoDB Atlas

1. Confirm the production Atlas cluster and database user are active. Give the user access only to `the_concept_interior`.
2. Copy the Atlas connection URI. Keep it private; do not put it in the frontend or commit it to Git.
3. Configure Atlas network access for Vercel. Vercel functions normally use a dynamic pool of outbound IPs. If the Vercel plan/project has Static IPs, enable them and add the assigned IPs to the Atlas IP access list. If it does not, Atlas must allow Vercel's changing egress addresses; opening `0.0.0.0/0` allows connection attempts from anywhere, so only use it with a strong database password and least-privilege database user. Prefer a fixed-IP or private-network option for production.

Do not add the local development machine's IP as the only Atlas entry; that only permits local connections.

## 2. Seed the production database once

From a trusted local terminal, with the production Atlas URI available in `backend/.env`, run:

```bash
cd backend
npm install
npm run seed
```

The seed script creates the company, categories, and sample quotation data. Run it deliberately against the production database. Do not run `npm run seed` as part of Vercel's build command.

## 3. Push the project to Git

Vercel's Git integration deploys each project from the same repository. Push the project to GitHub, GitLab, or Bitbucket. Keep `backend/.env` and `frontend/.env` out of Git; use Vercel's Environment Variables settings for deployment values.

## 4. Create the backend Vercel project

1. In Vercel, choose **Add New → Project** and import this repository.
2. Set **Root Directory** to `backend`.
3. Use the Express framework detection. Set Node.js to `22.x` for this project.
4. Add these **Production** environment variables in **Project Settings → Environment Variables**:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | Production Atlas connection URI |
   | `MONGODB_DATABASE` | `the_concept_interior` |
   | `CLIENT_ORIGIN` | The frontend's production origin, e.g. `https://tc-interior.vercel.app` |
   | `BLOB_READ_WRITE_TOKEN` | Add/connect the Blob store token(s) used by the storage implementation |

   `PORT` is not needed on Vercel. Add environment variables to Preview only if you intentionally want preview builds to connect to a separate test database and storage.
5. Deploy the backend project. Copy its production URL, for example `https://tc-interior-api.vercel.app`.
6. Open `https://<backend-domain>/`. The backend status page should show **Connected successfully** when MongoDB is reachable. `/api/v1/health` checks the API process separately. If the status page reports a database failure, inspect the backend deployment's runtime logs and check the Atlas access list and environment variable names.

## 5. Create the frontend Vercel project

1. In Vercel, import the same Git repository again as a **second project**.
2. Set **Root Directory** to `frontend`.
3. Select the Vite framework preset. Use:

   - Build command: `npm run build`
   - Output directory: `dist`
   - Node.js version: `22.x`

4. In `frontend/vercel.json`, add the SPA fallback so reloading a nested React Router URL serves `index.html`:

   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "rewrites": [
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```

5. Add this **Production** environment variable to the frontend project:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://<backend-domain>/api/v1` |

   `VITE_API_URL` is embedded in the frontend at build time. Redeploy the frontend after changing it.
6. Deploy and copy the frontend's production origin, for example `https://tc-interior.vercel.app`.

## 6. Connect CORS and redeploy

In the backend project's Production environment, set `CLIENT_ORIGIN` to the exact frontend origin, without a trailing slash, for example:

```text
https://tc-interior.vercel.app
```

Save the variable and redeploy the backend. The current API CORS configuration allows one origin. Preview URLs use different origins, so preview deployments may need a separate test setup or an explicit safe-origin allowlist in the API.

## 7. Check the deployed application

1. Open the frontend production URL and confirm the dashboard loads.
2. Confirm the browser's API calls go to the backend production domain and do not fail with CORS errors.
3. Create a test client, category/product, quotation, invoice, and payment.
4. Generate and download a quotation PDF and an invoice PDF.
5. Upload a logo and product image, then reload the app and confirm both still display. This verifies uploads use persistent storage rather than the function filesystem.
6. Open a nested page directly, such as `/clients`, then refresh. It should return the React app rather than a Vercel 404.
7. Check that private PDFs are served through the API and are not stored in a public Blob store.

## Environment variable summary

| Project | Variable | Purpose |
|---|---|---|
| Backend | `MONGODB_URI` | Atlas connection string; secret |
| Backend | `MONGODB_DATABASE` | `the_concept_interior` |
| Backend | `CLIENT_ORIGIN` | Allowed production frontend origin |
| Backend | `BLOB_READ_WRITE_TOKEN` | Persistent file storage; secret |
| Frontend | `VITE_API_URL` | Backend API base ending in `/api/v1` |

Vercel applies environment variable changes only to new deployments, so redeploy the affected project after editing a variable.

## Official references

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vite on Vercel and SPA deep links](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Function filesystem](https://vercel.com/docs/functions/runtimes)
- [Vercel Blob](https://vercel.com/docs/vercel-blob)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel static egress IPs](https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address)
- [MongoDB Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
