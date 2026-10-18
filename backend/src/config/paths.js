import path from 'path';
import { fileURLToPath } from 'url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(srcDir, '../..');
export const uploadsDir = path.join(rootDir, 'uploads');
