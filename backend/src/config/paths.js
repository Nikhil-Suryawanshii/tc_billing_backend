import fs from 'node:fs';
import path from 'path';

const workingDir = process.cwd();
const nestedBackendDir = path.join(workingDir, 'backend');
export const rootDir = fs.existsSync(path.join(nestedBackendDir, 'package.json'))
  ? nestedBackendDir
  : workingDir;

export const uploadsDir = path.join(rootDir, 'uploads');
