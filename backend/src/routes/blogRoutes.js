import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import * as blogController from '../controllers/blogController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file || !file.mimetype) return cb(null, true);
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

function optionalCoverUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  return upload.single('cover')(req, res, next);
}

const router = express.Router();

router.get('/', blogController.listPublishedBlogs);
router.post('/seed-defaults', requireAuth, requireAdmin, blogController.seedLegacyBlogs);
router.get('/:slug', blogController.getBlogBySlug);

router.post('/', requireAuth, requireAdmin, optionalCoverUpload, blogController.createBlog);
router.put('/:id', requireAuth, requireAdmin, optionalCoverUpload, blogController.updateBlog);
router.delete('/:id', requireAuth, requireAdmin, blogController.deleteBlog);

export default router;
