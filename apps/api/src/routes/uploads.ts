import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// POST /api/uploads
// Cast needed: multer resolves @types/express-serve-static-core from root node_modules
// while apps/api has its own copy — identical at runtime but incompatible TypeScript paths
router.post('/', upload.single('file') as any, (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Error handler for multer errors
router.use((err: Error, _req: Request, res: Response, next: Function) => {
  if (err.message === 'Only image files are allowed') {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message?.includes('File too large')) {
    res.status(400).json({ error: 'File too large (max 10MB)' });
    return;
  }
  next(err);
});

export default router;
