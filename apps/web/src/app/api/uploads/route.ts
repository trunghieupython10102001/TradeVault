import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import path from 'path';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getS3Config() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET;

  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    const missing = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET']
      .filter((key) => !process.env[key]);
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }

  return { region, accessKeyId, secretAccessKey, bucket };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const ext = path.extname(file.name) || '.png';
    const filename = `trades/${randomUUID()}${ext}`;

    const { region, accessKeyId, secretAccessKey, bucket } = getS3Config();
    const arrayBuffer = await file.arrayBuffer();
    const s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: filename,
      Body: Buffer.from(arrayBuffer),
      ContentType: file.type,
    }));

    return NextResponse.json({ url: `https://${bucket}.s3.${region}.amazonaws.com/${filename}` });
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
