/**
 * `pnpm storage:check` — verify a hosted bucket (Cloudflare R2 / S3) before deploying: the keys work,
 * the bucket exists, and an encrypted object can be written, read back and deleted.
 *
 * The access keys are asked at the prompt, so they never land in a file, shell history or the repo.
 * Nothing is left in the bucket.
 */
/* eslint-disable no-console -- interactive CLI: output is for the person at the terminal */
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createDocumentCrypto } from '../src/infra/document-crypto.js';
import { createObjectStore } from '../src/infra/storage.js';

const rl = createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt: string, fallback = ''): Promise<string> {
  process.stdout.write(fallback ? `${prompt} [${fallback}]: ` : `${prompt}: `);
  const next = await lines.next();
  const value = next.done ? '' : String(next.value).trim();
  return value || fallback;
}

const endpoint = await ask('رابط الـ S3 API (Endpoint)', process.env.STORAGE_ENDPOINT ?? '');
const bucket = await ask('اسم الـ bucket', 'sabeq');
const accessKeyId = await ask('Access Key ID');
const secretAccessKey = await ask('Secret Access Key');
rl.close();

if (!endpoint.startsWith('https://') || !accessKeyId || !secretAccessKey) {
  console.error('\n✗ محتاج الرابط (https://…) والمفتاحين.');
  process.exit(1);
}
// The bucket is a separate setting; an endpoint copied with "/bucket" at the end still works.
const base = new URL(endpoint);
base.pathname = '/';

const store = createObjectStore({
  endpoint: base.toString().replace(/\/$/, ''),
  region: 'auto',
  privateBucket: bucket,
  accessKeyId,
  secretAccessKey,
  forcePathStyle: true,
});
const crypto = createDocumentCrypto({
  active: 'check',
  keys: new Map([['check', randomBytes(32)]]),
});

const step = async (label: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (err) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error(
      `✗ ${label}: ${e.name ?? 'Error'} ${e.$metadata?.httpStatusCode ?? ''} ${e.message ?? ''}`,
    );
    process.exit(1);
  }
};

console.log(`\n→ ${base.host} / ${bucket}`);
const key = `healthcheck/${randomBytes(8).toString('hex')}`;
const plain = Buffer.from(`sabeq storage check ${new Date().toISOString()}`);
await step('الـ bucket موجود والمفاتيح شغالة', () => store.readiness().check());
const sealed = crypto.seal(plain, key);
await step('رفع ملف مشفّر', () => store.put(key, sealed.blob, 'application/octet-stream'));
await step('قراية الملف وفك تشفيره', async () => {
  const back = crypto.open(await store.get(key), sealed.keyId, key);
  if (!back.equals(plain)) throw new Error('content mismatch');
});
await step('مسح ملف التجربة', () => store.delete(key));
console.log('\n✓ التخزين جاهز. حط نفس القيم في إعدادات السيرفر وقت الرفع.');
