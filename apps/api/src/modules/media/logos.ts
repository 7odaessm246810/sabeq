/**
 * Public images, one URL shape each (`/api/v1/media/<kind>/<name>`):
 * - logos — universities and faculties. Bundled ones ship in `apps/api/assets/logos` (seeded rows
 *   point at them); uploaded ones live in object storage under `logos/`.
 * - avatars — mentor profile photos (Phase 12), uploaded by the mentor, under `avatars/`.
 * These are shown publicly, so unlike mentor documents they are stored unencrypted. Names are random
 * per upload, so a URL never changes content.
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

export const IMAGE_NAME = /^[a-z0-9-]+\.(png|jpg|webp)$/;
const CONTENT_TYPE = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;
type Ext = keyof typeof CONTENT_TYPE;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** The type comes from the bytes, never from the request's Content-Type. */
export function sniffImage(buf: Buffer): Ext | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp';
  return null;
}

export const logoUrl = (key: string | null | undefined) =>
  key ? `/api/v1/media/logos/${key}` : null;
export const avatarUrl = (key: string | null | undefined) =>
  key ? `/api/v1/media/avatars/${key}` : null;

export interface ImageStore {
  /** Validates and stores an uploaded image; returns its new name. */
  save(body: unknown): Promise<string>;
  /** Removes an uploaded image (never a bundled one). */
  remove(name: string | null | undefined): Promise<void>;
  read(name: string): Promise<{ body: Buffer; contentType: string } | null>;
}

function createImageStore(
  store: ObjectStore,
  opts: { prefix: 'logos' | 'avatars'; what: string; bundledDir?: string },
): ImageStore {
  const bundled = (name: string) =>
    opts.bundledDir ? existsSync(path.join(opts.bundledDir, name)) : false;
  return {
    async save(body) {
      if (!Buffer.isBuffer(body) || body.length === 0)
        throw Errors.validation({ file: 'ارفع صورة.' }, `ارفع ${opts.what}.`);
      if (body.length > LOGO_MAX_BYTES)
        throw Errors.validation(
          { file: 'الصورة كبيرة.' },
          `${opts.what} لازم تكون أقل من 512 كيلوبايت.`,
        );
      const ext = sniffImage(body);
      if (!ext)
        throw Errors.validation(
          { file: 'نوع الصورة مش مدعوم.' },
          `${opts.what} لازم تكون PNG أو JPG أو WebP.`,
        );
      const name = `${randomUUID()}.${ext}`;
      await store.put(`${opts.prefix}/${name}`, body, CONTENT_TYPE[ext]);
      return name;
    },

    async remove(name) {
      if (!name || bundled(name)) return;
      await store.delete(`${opts.prefix}/${name}`);
    },

    async read(name) {
      if (!IMAGE_NAME.test(name)) return null;
      const contentType = CONTENT_TYPE[name.split('.').pop() as Ext];
      if (opts.bundledDir && bundled(name))
        return { body: await readFile(path.join(opts.bundledDir, name)), contentType };
      try {
        return { body: await store.get(`${opts.prefix}/${name}`), contentType };
      } catch {
        return null;
      }
    },
  };
}

export const createLogoStore = (store: ObjectStore) =>
  createImageStore(store, { prefix: 'logos', what: 'صورة اللوجو', bundledDir: BUNDLED_LOGOS_DIR });
export const createAvatarStore = (store: ObjectStore) =>
  createImageStore(store, { prefix: 'avatars', what: 'الصورة الشخصية' });

export type LogoStore = ImageStore;
export type AvatarStore = ImageStore;
