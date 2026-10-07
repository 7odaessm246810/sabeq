import { describe, expect, it } from 'vitest';
import { createDocumentCrypto } from './document-crypto.js';

const k1 = Buffer.alloc(32, 1);
const k2 = Buffer.alloc(32, 2);
const file = Buffer.from('%PDF-1.7 national id scan');

describe('document crypto', () => {
  it('round-trips and never stores the plain bytes', () => {
    const c = createDocumentCrypto({ active: 'k1', keys: new Map([['k1', k1]]) });
    const { keyId, blob } = c.seal(file, 'docs/a.pdf');
    expect(keyId).toBe('k1');
    expect(blob.includes(Buffer.from('national id'))).toBe(false);
    expect(c.open(blob, keyId, 'docs/a.pdf').equals(file)).toBe(true);
  });

  it('uses a fresh IV per file', () => {
    const c = createDocumentCrypto({ active: 'k1', keys: new Map([['k1', k1]]) });
    expect(c.seal(file, 'x').blob.equals(c.seal(file, 'x').blob)).toBe(false);
  });

  it('refuses tampering and blobs moved to another object', () => {
    const c = createDocumentCrypto({ active: 'k1', keys: new Map([['k1', k1]]) });
    const { blob } = c.seal(file, 'docs/a.pdf');
    expect(() => c.open(blob, 'k1', 'docs/b.pdf')).toThrow();
    const bad = Buffer.from(blob);
    bad[bad.length - 1] = (bad.at(-1) ?? 0) ^ 1;
    expect(() => c.open(bad, 'k1', 'docs/a.pdf')).toThrow();
  });

  it('reads old files after key rotation', () => {
    const before = createDocumentCrypto({ active: 'k1', keys: new Map([['k1', k1]]) });
    const old = before.seal(file, 'docs/a.pdf');
    const after = createDocumentCrypto({
      active: 'k2',
      keys: new Map([
        ['k1', k1],
        ['k2', k2],
      ]),
    });
    expect(after.open(old.blob, old.keyId, 'docs/a.pdf').equals(file)).toBe(true);
    expect(after.seal(file, 'docs/c.pdf').keyId).toBe('k2');
  });
});
