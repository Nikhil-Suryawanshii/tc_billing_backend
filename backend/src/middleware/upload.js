import multer from 'multer';
import path from 'path';
import { uploadsDir } from '../config/paths.js';

export function imageUpload(folder) {
  return multer({
    storage: multer.diskStorage({
      destination: path.join(uploadsDir, folder),
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '') || 'image';
        cb(null, `${Date.now()}-${safe}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        const error = new Error('Upload an image file');
        error.status = 422;
        cb(error);
        return;
      }
      cb(null, true);
    },
  });
}
