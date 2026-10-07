/**
 * Private object storage over the S3 API — AWS S3 or Cloudflare R2 in hosted environments, a local
 * S3 gateway in Docker. Objects are never public: they are read only through the API (Phase 10:
 * audited admin access), never by a URL handed to the browser.
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Config } from '../config/env.js';
import type { ReadinessCheck } from '../modules/health/health.routes.js';

export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Local development only: create the bucket if the gateway starts empty. */
  ensureBucket(): Promise<void>;
  readiness(): ReadinessCheck;
}

export function createObjectStore(cfg: Config['storage']): ObjectStore {
  const client = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    maxAttempts: 3,
    // Checksums only where the S3 API requires them: R2 and local gateways reject or ignore some of
    // the newer default checksum headers. Integrity is covered by AES-GCM and the stored SHA-256.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const Bucket = cfg.privateBucket;

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!res.Body) throw new Error(`empty object ${key}`);
      return Buffer.from(await res.Body.transformToByteArray());
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },

    readiness() {
      return {
        name: 'storage',
        async check() {
          await client.send(new HeadBucketCommand({ Bucket }));
        },
      };
    },
  };
}
