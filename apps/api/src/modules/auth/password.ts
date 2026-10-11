/**
 * Password hashing with scrypt (built into Node, no native module to build in Docker).
 *
 * Parameters follow OWASP's scrypt guidance (N=2^15, r=8, p=3 ≈ 32 MiB, ~100 ms) and are stored
 * with each hash — `scrypt$N$r$p$salt$hash` — so they can be raised later; `needsRehash` tells the
 * login to upgrade old hashes when the person next signs in.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

export const PASSWORD_RULES = { min: 8, max: 128 } as const;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must exceed 128·N·r bytes, or Node refuses the parameters.
    scryptCb(
      password.normalize('NFKC'),
      salt,
      KEY_BYTES,
      { ...opts, maxmem: 256 * (opts.N ?? 1) * (opts.r ?? 1) },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

function parse(stored: string) {
  const [alg, n, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !key) return null;
  return {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    salt: Buffer.from(salt, 'base64'),
    key: Buffer.from(key, 'base64'),
  };
}

// Compared against when there is no account (or no password), so a wrong email takes as long as a
// wrong password and the timing does not reveal which emails are registered.
const DUMMY = hashPassword('dummy-password-for-timing');

/** `stored` null → still spends the same time, then answers false. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = parse(stored ?? (await DUMMY));
  if (!parsed) return false;
  const key = await scrypt(password, parsed.salt, { N: parsed.N, r: parsed.r, p: parsed.p });
  return stored !== null && key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.N < PARAMS.N || parsed.r !== PARAMS.r || parsed.p < PARAMS.p;
}
