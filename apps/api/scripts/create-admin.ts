/**
 * `pnpm admin:create` — the only way an admin account comes to exist (nobody signs up as admin).
 *
 * Asks for the email, name and admin role, creates the account (no password) and records it in the
 * audit log, then emails a link where the new admin picks a password (24 hours, single use). On the
 * first sign-in the admin app sets up the authenticator-app code.
 *
 * For an email that is already an admin, it resets instead: the password and app code are cleared,
 * every session ends, and a fresh link goes out — the recovery path for a lost phone or password.
 *
 * Needs DATABASE_URL, AUTH_OTP_SECRET, API_PUBLIC_WEB_URL and EMAIL_* (root .env locally; for a
 * hosted environment run it with that environment's variables, e.g. `railway run`). With
 * EMAIL_PROVIDER=console the link is printed here instead of sent.
 */
/* eslint-disable no-console -- interactive CLI: output is for the person at the terminal */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pino } from 'pino';
import { AdminRole } from '../src/generated/prisma/enums.js';
import { createDb } from '../src/infra/db.js';
import { LINK_MINUTES, passwordEmail, passwordToken } from '../src/modules/auth/links.js';
import { createEmailSender } from '../src/modules/notifications/email.js';

const rootEnv = path.join(import.meta.dirname, '../../../.env');
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const url = need('DATABASE_URL');
const secret = need('AUTH_OTP_SECRET');
const webUrl = (process.env.API_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const emailProvider = process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'console';

const ROLES = Object.values(AdminRole);
// Line by line from a terminal or a pipe (readline's question() drops lines that arrive early).
const rl = createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const next = await lines.next();
  return next.done ? '' : String(next.value).trim();
}
const email = (await ask('إيميل الأدمن: ')).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('الإيميل مش مظبوط');

const logger = pino({ level: 'silent' });
const db = createDb({ url, poolMax: 1, logger });
try {
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, admin: { select: { adminRole: true } } },
  });
  // One account = one role (ADR-0008): a student or mentor account is never promoted.
  if (existing && existing.role !== 'admin')
    throw new Error(`الإيميل ده مسجّل بالفعل كـ ${existing.role}`);

  let userId: string;
  if (existing) {
    rl.close();
    userId = existing.id;
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { passwordHash: null } }),
      db.admin.update({ where: { userId }, data: { totpSecretEnc: null, totpEnabledAt: null } }),
      db.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      db.auditLog.create({
        data: { actorRole: 'system', action: 'admin.reset', entityType: 'user', entityId: userId },
      }),
    ]);
    console.log('\n✓ الحساب موجود: اتمسح الباسورد وكود التطبيق، وكل الأجهزة خرجت.');
  } else {
    const fullName = await ask('الاسم: ');
    const role = (await ask(`الدور (${ROLES.join(' / ')}): `)) as AdminRole;
    rl.close();
    if (fullName.length < 2) throw new Error('اكتب الاسم');
    if (!ROLES.includes(role)) throw new Error(`الدور لازم يكون واحد من: ${ROLES.join(', ')}`);
    const user = await db.user.create({
      // Choosing the password from the emailed link proves the address.
      data: { email, fullName, role: 'admin', admin: { create: { adminRole: role } } },
      select: { id: true },
    });
    userId = user.id;
    await db.auditLog.create({
      data: {
        actorRole: 'system',
        action: 'admin.create',
        entityType: 'user',
        entityId: userId,
        after: { adminRole: role },
      },
    });
    console.log(`\n✓ اتعمل حساب أدمن (${role}).`);
  }

  const token = passwordToken(
    secret,
    { id: userId, passwordHash: null, email },
    Date.now() + LINK_MINUTES.admin * 60_000,
  );
  const link = `${webUrl}/reset-password?token=${token}`;
  if (emailProvider === 'console') {
    console.log(`\nرابط اختيار الباسورد (24 ساعة، مرة واحدة):\n${link}\n`);
  } else {
    const sender = createEmailSender(
      { provider: 'resend', from: need('EMAIL_FROM'), apiKey: need('EMAIL_API_KEY') },
      logger,
    );
    await sender.send({ to: email, ...passwordEmail('admin', link) });
    console.log(`بعتنا رابط اختيار الباسورد على ${email} (شغال 24 ساعة).`);
  }
} finally {
  await db.$disconnect();
}
