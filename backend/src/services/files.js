import fs from 'fs/promises';
import path from 'path';
import { rootDir } from '../config/paths.js';

export async function removeUpload(publicPath) {
  if (!publicPath || !String(publicPath).startsWith('/uploads/')) return;
  const relative = String(publicPath).replace(/^\/+/, '');
  const full = path.resolve(rootDir, relative);
  if (!full.startsWith(path.join(rootDir, 'uploads'))) return;
  await fs.unlink(full).catch(() => {});
}

export function fileUrl(req, publicPath) {
  if (!publicPath) return '';
  return `${req.protocol}://${req.get('host')}${publicPath}`;
}
