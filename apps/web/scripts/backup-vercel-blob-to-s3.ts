import 'dotenv/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { get } from '@vercel/blob';

const VERCEL_BLOB_HOST = '.public.blob.vercel-storage.com';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function s3Url(bucket: string, region: string, key: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function isVercelBlobTradeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(VERCEL_BLOB_HOST) && parsed.pathname.startsWith('/trades/');
  } catch {
    return false;
  }
}

function keyFromVercelBlobUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\//, '');
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

async function main() {
  const region = requiredEnv('AWS_REGION');
  const bucket = requiredEnv('AWS_S3_BUCKET');
  const accessKeyId = requiredEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnv('AWS_SECRET_ACCESS_KEY');
  const connectionString = requiredEnv('DATABASE_URL');
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const dryRun = process.argv.includes('--dry-run');
  const skipDb = process.argv.includes('--skip-db');
  if (skipDb) {
    throw new Error('DB migration needs DATABASE_URL. Remove --skip-db.');
  }

  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  let copied = 0;
  let updated = 0;

  try {
    const images = await prisma.tradeImage.findMany({
      where: {
        url: {
          contains: VERCEL_BLOB_HOST,
        },
      },
      select: { id: true, url: true },
    });

    for (const image of images) {
      if (!isVercelBlobTradeUrl(image.url)) {
        continue;
      }

      const sourceUrl = image.url;
      const key = keyFromVercelBlobUrl(sourceUrl);
      const destinationUrl = s3Url(bucket, region, key);

      console.log(`${dryRun ? 'Would copy' : 'Copying'} ${sourceUrl} -> ${destinationUrl}`);

      if (!dryRun) {
        let sourceBlob;
        try {
          sourceBlob = await get(key, {
            access: 'public',
            token: blobToken,
          });
        } catch (error) {
          const name = error instanceof Error ? error.name : 'UnknownError';
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Vercel Blob get failed for ${key}: ${name}: ${message}`);
        }
        if (!sourceBlob || sourceBlob.statusCode !== 200) {
          throw new Error(`Failed to fetch ${sourceUrl}`);
        }

        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: await streamToBuffer(sourceBlob.stream),
          ContentType: sourceBlob.blob.contentType,
        }));
        copied += 1;
      }

      if (dryRun) {
        console.log(`Would update trade_images.id=${image.id} ${sourceUrl} -> ${destinationUrl}`);
      } else {
        await prisma.tradeImage.update({
          where: { id: image.id },
          data: { url: destinationUrl },
        });
        updated += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`Finished. copied=${copied} updated=${updated} dryRun=${dryRun} skipDb=${skipDb}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
