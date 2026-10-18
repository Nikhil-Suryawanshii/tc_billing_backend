import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { connectDb } from './config/db.js';
import { uploadsDir } from './config/paths.js';

dotenv.config();

await Promise.all(['company', 'products', 'pdfs'].map((folder) =>
  fs.mkdir(path.join(uploadsDir, folder), { recursive: true })
));
await connectDb();

const { default: app } = await import('./server.js');
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log('Connected to MongoDB Atlas');
});
