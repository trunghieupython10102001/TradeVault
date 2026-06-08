import { NextRequest, NextResponse } from 'next/server';
import { createHmac, createHash } from 'crypto';
import { randomUUID } from 'crypto';
import path from 'path';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function presignedPutUrl({
  region,
  bucket,
  key,
  accessKeyId,
  secretAccessKey,
  expiresIn,
}: {
  region: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresIn: number;
}): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const datetime = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const credentialScope = `${date}/${region}/s3/aws4_request`;
  const encodedKey = '/' + key.split('/').map(encodeURIComponent).join('/');

  const params: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', datetime],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'host'],
  ].sort(([a], [b]) => a.localeCompare(b)) as [string, string][];

  const queryString = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    encodedKey,
    queryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), 's3'),
    'aws4_request'
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return `https://${host}${encodedKey}?${queryString}&X-Amz-Signature=${signature}`;
}

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

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET;

  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    const missing = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET']
      .filter((k) => !process.env[k]);
    return NextResponse.json({ error: `Missing env vars: ${missing.join(', ')}` }, { status: 500 });
  }

  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = safeFilename.split('.').pop() ?? 'png';
  const key = `journal-images/${auth.userId}/${randomUUID()}.${ext}`;

  const uploadUrl = presignedPutUrl({ region, bucket, key, accessKeyId, secretAccessKey, expiresIn: 300 });
  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  return NextResponse.json({ uploadUrl, publicUrl });
}
