import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from './password.js';

describe('passwords', () => {
  it('hashes with a fresh salt and verifies only the right password', async () => {
    const a = await hashPassword('كلمة سر طويلة');
    const b = await hashPassword('كلمة سر طويلة');
    expect(a).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('كلمة سر طويلة', a)).toBe(true);
    expect(await verifyPassword('كلمة سر طويله', a)).toBe(false);
    expect(needsRehash(a)).toBe(false);
  });

  it('answers false for missing or unknown hashes, and flags weak ones for upgrade', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$whatever')).toBe(false);
    expect(needsRehash('scrypt$16384$8$1$c2FsdA==$a2V5')).toBe(true);
  });
});
