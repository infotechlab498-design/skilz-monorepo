import multer from 'multer';

export function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export function apiErrorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'Image must be 2MB or smaller' });
    }
    return res.status(400).json({ success: false, error: err.message || 'Upload error' });
  }

  const statusCode = Number(err?.statusCode) || 500;
  const message = err?.message || 'Internal server error';
  return res.status(statusCode).json({ success: false, error: message });
}
