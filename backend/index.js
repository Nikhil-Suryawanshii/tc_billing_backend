import fs from 'node:fs';
import path from 'path';

// On Vercel, /tmp is the only writable dir. Pre-create upload subdirectories.
const uploadsBase = process.env.VERCEL ? '/tmp/uploads' : null;
if (uploadsBase) {
  for (const folder of ['company', 'products', 'pdfs']) {
    fs.mkdirSync(path.join(uploadsBase, folder), { recursive: true });
  }
}

import app from './src/server.js';

export default async (req, res) => {
  app(req, res);
};
