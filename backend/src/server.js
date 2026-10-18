import express from 'express';
import cors from 'cors';
import { connectDb } from './config/db.js';
import { uploadsDir } from './config/paths.js';
import { asyncHandler } from './lib/asyncHandler.js';
import api from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsDir));
app.get('/', asyncHandler(async (_req, res) => {
  try {
    await connectDb();
    res.status(200).type('html').send(statusPage(true));
  } catch (error) {
    console.error('Backend status check failed:', error.message);
    res.status(503).type('html').send(statusPage(false));
  }
}));
app.use('/api/v1', asyncHandler(async (req, _res, next) => {
  if (req.path !== '/health') await connectDb();
  next();
}));
app.use('/api/v1', api);
app.use(notFound);
app.use(errorHandler);

function statusPage(databaseConnected) {
  const status = databaseConnected ? 'Connected successfully' : 'Database connection failed';
  const description = databaseConnected
    ? 'The backend is running and connected to MongoDB.'
    : 'The backend is running, but it could not connect to MongoDB. Check the backend deployment logs and environment variables.';
  const color = databaseConnected ? '#15803d' : '#b91c1c';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Backend status</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f6f3ee; color: #1c1917; font: 16px/1.5 system-ui, sans-serif; }
      main { width: min(100%, 520px); padding: 36px; border: 1px solid #e7e5e4; border-radius: 18px; background: white; box-shadow: 0 12px 36px #1c19170d; }
      .mark { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: ${databaseConnected ? '#dcfce7' : '#fee2e2'}; color: ${color}; font-size: 24px; font-weight: 700; }
      h1 { margin: 20px 0 8px; font-size: 26px; letter-spacing: -0.03em; }
      .status { margin: 0; color: ${color}; font-weight: 700; }
      .description { margin: 10px 0 24px; color: #57534e; }
      a { color: #0369a1; font-weight: 600; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .label { margin-top: 24px; color: #78716c; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">${databaseConnected ? '✓' : '!'}</div>
      <h1>THE CONCEPT DESIGNERS API</h1>
      <p class="status">${status}</p>
      <p class="description">${description}</p>
      <a href="/api/v1/health">Open API health endpoint →</a>
      <p class="label">Service status</p>
      <div>Backend: Running</div>
      <div>MongoDB: ${databaseConnected ? 'Connected' : 'Unavailable'}</div>
    </main>
  </body>
</html>`;
}

export default app;
