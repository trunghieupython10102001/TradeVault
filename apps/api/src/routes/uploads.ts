import { Router, Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// GET /api/uploads/presigned?filename=photo.jpg&contentType=image/jpeg
router.get('/presigned', async (req: Request, res: Response) => {
  const { filename, contentType } = req.query as { filename: string; contentType: string };
  if (!filename || !contentType) {
    res.status(400).json({ error: 'filename and contentType are required' });
    return;
  }
  if (!contentType.startsWith('image/')) {
    res.status(400).json({ error: 'Only image files are allowed' });
    return;
  }

  const ext = filename.split('.').pop() ?? 'png';
  const key = `journal-images/${req.userId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  const publicUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  res.json({ uploadUrl, publicUrl });
});

export default router;
