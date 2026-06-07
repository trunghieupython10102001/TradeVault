import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import path from 'path';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(request: NextRequest) {
  const auth = getUserIdFromRequest(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = request.nextUrl;
  const filename = searchParams.get('filename') ?? '';
  const contentType = searchParams.get('contentType') ?? '';

  if (!filename || !contentType) {
    return NextResponse.json({ error: 'filename and contentType are required' }, { status: 400 });
  }
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
  }
  if (filename.length > 255) {
    return NextResponse.json({ error: 'Filename too long' }, { status: 400 });
  }

  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = safeFilename.split('.').pop() ?? 'png';
  const key = `journal-images/${auth.userId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  try {
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const publicUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[presigned] S3 error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
