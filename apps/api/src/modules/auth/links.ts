/**
 * Password links (forgot password, and the first password of a new admin) — signed, not stored.
 *
 * The token carries the user id, an expiry and a fingerprint of the account's current password hash
 * and email. Setting a password changes the hash, so a link works once; changing the email kills
 * links sent to the old address. Nothing to clean up, and a Redis flush cannot revive a used link.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { renderEmail } from '../notifications/email.js';

/** How long an emailed link works: forgot password, and a new admin's first password. */
export const LINK_MINUTES = { reset: 60, admin: 24 * 60 } as const;

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function fingerprint(account: {
  passwordHash: string | null;
  email: string | null;
}): string {
  return createHash('sha256')
    .update(`${account.passwordHash ?? ''}|${account.email ?? ''}`)
    .digest('base64url')
    .slice(0, 22);
}

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(`password-reset:${payload}`).digest('base64url');

export function passwordToken(
  secret: string,
  account: { id: string; passwordHash: string | null; email: string | null },
  expiresAt: number,
): string {
  const payload = b64(JSON.stringify({ u: account.id, x: expiresAt, f: fingerprint(account) }));
  return `${payload}.${sign(secret, payload)}`;
}

/** The claims of a well-signed, unexpired token (the fingerprint is checked by the caller). */
export function readPasswordToken(
  secret: string,
  token: string,
  nowMs: number,
): { userId: string; fingerprint: string } | null {
  const [payload = '', sig = ''] = token.split('.');
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      u?: unknown;
      x?: unknown;
      f?: unknown;
    };
    if (typeof c.u !== 'string' || typeof c.x !== 'number' || typeof c.f !== 'string') return null;
    return c.x > nowMs ? { userId: c.u, fingerprint: c.f } : null;
  } catch {
    return null;
  }
}

/** Subject and body of the email carrying a password link. */
export function passwordEmail(kind: 'reset' | 'admin', link: string) {
  const { text, html } = renderEmail(
    kind === 'admin'
      ? {
          title: 'حسابك في لوحة إدارة سابق',
          body: 'اتعملك حساب أدمن على سابق. دوس على الزرار واختار باسورد، وبعدها سجّل دخولك من لوحة الإدارة وفعّل كود التطبيق. الرابط شغال 24 ساعة ولمرة واحدة.',
          action: { label: 'اختار الباسورد', url: link },
          footer: 'لو مش متوقع الرسالة دي، تجاهلها وبلّغ مدير المنصة.',
        }
      : {
          title: 'غيّر الباسورد',
          body: 'طلبت تغيير باسورد حسابك على سابق. دوس على الزرار واختار باسورد جديد. الرابط شغال ساعة ولمرة واحدة.',
          action: { label: 'اختار باسورد جديد', url: link },
          footer: 'لو مش انت اللي طلبت ده، تجاهل الرسالة — الباسورد القديم لسه شغال.',
        },
  );
  return {
    subject: kind === 'admin' ? 'حسابك في لوحة إدارة سابق' : 'غيّر باسورد سابق',
    text,
    html,
  };
}
