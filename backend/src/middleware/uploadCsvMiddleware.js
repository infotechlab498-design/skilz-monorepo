import path from 'path';
import multer from 'multer';
import { createHttpError } from './errorHandler.js';

const MAX_CSV_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    const ext = path.extname(String(file?.originalname || '')).toLowerCase();
    const ok =
      ext === '.csv' ||
      mime === 'text/csv' ||
      mime === 'application/csv' ||
      mime === 'application/vnd.ms-excel';
    if (!ok) {
      cb(createHttpError(400, 'Upload must be a .csv file'));
      return;
    }
    cb(null, true);
  },
});

export const parseSingleQuestionsCsv = upload.single('file');
