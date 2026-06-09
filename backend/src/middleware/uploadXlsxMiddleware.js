import path from 'path';
import multer from 'multer';
import { createHttpError } from './errorHandler.js';

const MAX_XLSX_BYTES = 4 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_XLSX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    const ext = path.extname(String(file?.originalname || '')).toLowerCase();
    const ok =
      ext === '.xlsx' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!ok) {
      cb(createHttpError(400, 'Upload must be a .xlsx file'));
      return;
    }
    cb(null, true);
  },
});

export const parseSingleQuestionsXlsx = upload.single('file');
