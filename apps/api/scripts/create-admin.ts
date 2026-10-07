/**
 * `pnpm admin:create` — the only way an admin account comes to exist (nobody signs up as admin).
 *
 * Asks for the phone, name and admin role, creates the account and records it in the audit log.
 * Uses DATABASE_URL from the environment (root .env locally); for Neon, set it in the same terminal.
 */
/* eslint-disable no-console -- interactive CLI: output is for the person at the terminal */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { normalizeEgyptianMobile } from '@sabeq/utils';
import { pino } from 'pino';
import { AdminRole } from '../src/generated/prisma/enums.js';
import { createDb } from '../src/infra/db.js';

const rootEnv = path.join(import.meta.dirname, '../../../.env');
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const ROLES = Object.values(AdminRole);
// Line by line from a terminal or a pipe (readline's question() drops lines that arrive early).
const rl = createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const next = await lines.next();
  return next.done ? '' : String(next.value).trim();
}
const phone = normalizeEgyptianMobile(await ask('رقم موبايل الأدمن: '));
const fullName = await ask('الاسم: ');
const role = (await ask(`الدور (${ROLES.join(' / ')}): `)) as AdminRole;
rl.close();

if (!phone) throw new Error('رقم موبايل مصري غير صحيح');
if (fullName.length < 2) throw new Error('اكتب الاسم');
if (!ROLES.includes(role)) throw new Error(`الدور لازم يكون واحد من: ${ROLES.join(', ')}`);

const db = createDb({ url, poolMax: 1, logger: pino({ level: 'silent' }) });
try {
  const existing = await db.user.findUnique({ where: { phone }, select: { role: true } });
  // One account = one role (ADR-0008): a student or mentor number is never promoted.
  if (existing) throw new Error(`الرقم ده مسجّل بالفعل كـ ${existing.role}`);

  const user = await db.user.create({
    data: { phone, fullName, role: 'admin', admin: { create: { adminRole: role } } },
    select: { id: true },
  });
  await db.auditLog.create({
    data: {
      actorRole: 'system',
      action: 'admin.create',
      entityType: 'user',
      entityId: user.id,
      after: { adminRole: role },
    },
  });
  console.log(`\n✓ اتعمل حساب أدمن (${role}). يدخل من لوحة الإدارة بالرقم ده + كود SMS.`);
} finally {
  await db.$disconnect();
}
