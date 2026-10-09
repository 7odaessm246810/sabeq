/**
 * University and faculty logos. Two homes, one URL (`/api/v1/media/logos/<name>`):
 * - bundled: researched logos shipped in `apps/api/assets/logos` (seeded rows point at them);
 * - uploaded: files an admin uploads, kept in object storage under `logos/`.
 * Logos are public images, so unlike mentor documents they are stored unencrypted.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOGO_MAX_BYTES } from '@sabeq/types';
import { Errors } from '../../core/errors.js';
import type { ObjectStore } from '../../infra/storage.js';

/** Same depth from src/ (tsx) and dist/ (compiled), so this resolves to apps/api/assets/logos. */
export const BUNDLED_LOGOS_DIR = path.join(import.meta.dirname, '../../../assets/logos');

export const LOGO_NAME = /^[a-z0-9-]+\.(png|jpg|webp)$/;
const CONTENT_TYPE = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;
type Ext = keyof typeof CONTENT_TYPE;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** The type comes from the bytes, never from the request's Content-Type. */
export function sniffLogo(buf: Buffer): Ext | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp';
  return null;
}

export const logoUrl = (key: string | null | undefined) =>
  key ? `/api/v1/media/logos/${key}` : null;

const isBundled = (name: string) => existsSync(path.join(BUNDLED_LOGOS_DIR, name));

export function createLogoStore(store: ObjectStore) {
  return {
    /** Validates and stores an uploaded logo; returns its new name. */
    async save(body: unknown): Promise<string> {
      if (!Buffer.isBuffer(body) || body.length === 0)
        throw Errors.validation({ file: 'ارفع صورة.' }, 'ارفع صورة اللوجو.');
      if (body.length > LOGO_MAX_BYTES)
        throw Errors.validation({ file: 'الصورة كبيرة.' }, 'اللوجو لازم يكون أقل من 512 كيلوبايت.');
      const ext = sniffLogo(body);
      if (!ext)
        throw Errors.validation(
          { file: 'نوع الصورة مش مدعوم.' },
          'اللوجو لازم يكون PNG أو JPG أو WebP.',
        );
      const name = `${randomUUID()}.${ext}`;
      await store.put(`logos/${name}`, body, CONTENT_TYPE[ext]);
      return name;
    },

    /** Removes an uploaded logo. Bundled logos stay: other rows or a re-seed may use them. */
    async remove(name: string | null | undefined) {
      if (!name || isBundled(name)) return;
      await store.delete(`logos/${name}`);
    },

    async read(name: string): Promise<{ body: Buffer; contentType: string } | null> {
      if (!LOGO_NAME.test(name)) return null;
      const contentType = CONTENT_TYPE[name.split('.').pop() as Ext];
      if (isBundled(name))
        return { body: await readFile(path.join(BUNDLED_LOGOS_DIR, name)), contentType };
      try {
        return { body: await store.get(`logos/${name}`), contentType };
      } catch {
        return null;
      }
    },
  };
}

export type LogoStore = ReturnType<typeof createLogoStore>;
