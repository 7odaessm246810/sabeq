/**
 * Application-level encryption for mentor documents (national IDs, certificates) — decision
 * 2026-10-07: keep the images, encrypted. The bucket's own encryption protects disks; this protects
 * against a leaked bucket credential or a misconfigured bucket.
 *
 * AES-256-GCM with a random 96-bit IV per file. The storage key is bound as additional data, so a
 * ciphertext copied to another object cannot be decrypted there. Each file records the id of the key
 * that sealed it, so keys can be rotated without re-encrypting old files.
 *
 * Blob layout: [1 byte version = 1][12 bytes IV][16 bytes tag][ciphertext].
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface DocumentCrypto {
  seal(plain: Buffer, storageKey: string): { keyId: string; blob: Buffer };
  open(blob: Buffer, keyId: string, storageKey: string): Buffer;
}

export function createDocumentCrypto(cfg: {
  active: string;
  keys: ReadonlyMap<string, Buffer>;
}): DocumentCrypto {
  const keyFor = (id: string) => {
    const key = cfg.keys.get(id);
    if (!key) throw new Error(`document key "${id}" is not configured`);
    return key;
  };

  return {
    seal(plain, storageKey) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', keyFor(cfg.active), iv);
      cipher.setAAD(Buffer.from(storageKey));
      const body = Buffer.concat([cipher.update(plain), cipher.final()]);
      return {
        keyId: cfg.active,
        blob: Buffer.concat([Buffer.of(VERSION), iv, cipher.getAuthTag(), body]),
      };
    },

    open(blob, keyId, storageKey) {
      if (blob.length < 1 + IV_BYTES + TAG_BYTES || blob[0] !== VERSION) {
        throw new Error('unknown document blob format');
      }
      const iv = blob.subarray(1, 1 + IV_BYTES);
      const tag = blob.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', keyFor(keyId), iv);
      decipher.setAAD(Buffer.from(storageKey));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(blob.subarray(1 + IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]);
    },
  };
}
