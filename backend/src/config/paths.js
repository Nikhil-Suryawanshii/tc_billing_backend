import fs from 'node:fs';
import path from 'path';

const workingDir = process.cwd();
const nestedBackendDir = path.join(workingDir, 'backend');
export const rootDir = fs.existsSync(path.join(nestedBackendDir, 'package.json'))
  ? nestedBackendDir
  : workingDir;

// Vercel serverless has a read-only filesystem except for /tmp.
// Use /tmp for all file writes when running on Vercel.
export const uploadsDir = process.env.VERCEL
  ? '/tmp/uploads'
  : path.join(rootDir, 'uploads');
