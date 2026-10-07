/**
 * `pnpm db:remote` — set up a hosted database (Neon) in one step: apply migrations, seed the
 * catalog, print row counts.
 *
 * Asks for the connection string at the prompt, so it is never written to a file, a shell history
 * or the repo. Paste the pooled URL (host with "-pooler"); the direct URL migrations need is derived
 * from it. Demo mentors are never seeded here (APP_ENV=staging).
 */
/* eslint-disable no-console -- interactive CLI: output is for the person at the terminal */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const raw = (await rl.question('الصق رابط Neon (اللي فيه -pooler) واضغط Enter:\n> ')).trim();
rl.close();

let pooled: URL;
try {
  pooled = new URL(raw.replace(/^['"]|['"]$/g, ''));
} catch {
  console.error('✗ ده مش رابط صحيح. لازم يبدأ بـ postgresql://');
  process.exit(1);
}
if (!/^postgres(ql)?:$/.test(pooled.protocol)) {
  console.error('✗ الرابط لازم يبدأ بـ postgresql://');
  process.exit(1);
}
// Common copy/paste slip: "channel_binding=requir".
if (pooled.searchParams.get('channel_binding')?.startsWith('requir')) {
  pooled.searchParams.set('channel_binding', 'require');
}
if (!pooled.searchParams.has('sslmode')) pooled.searchParams.set('sslmode', 'require');

const direct = new URL(pooled);
direct.hostname = direct.hostname.replace('-pooler', '');

const env = {
  ...process.env,
  APP_ENV: 'staging',
  DATABASE_URL: pooled.toString(),
  DATABASE_DIRECT_URL: direct.toString(),
};
console.log(`\n→ قاعدة البيانات: ${direct.hostname} / ${direct.pathname.slice(1)}`);

const require = createRequire(import.meta.url);
const run = (label: string, bin: string, args: string[]) => {
  console.log(`\n→ ${label}`);
  const r = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit', env });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} فشل — ابعت الرسالة اللي فوق (من غير الرابط).`);
    process.exit(r.status ?? 1);
  }
};

run('تطبيق الـ migrations', require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
run('إضافة البيانات الأساسية', require.resolve('tsx/cli'), [
  path.join(import.meta.dirname, '../prisma/seed.ts'),
]);

const client = new pg.Client({ connectionString: direct.toString() });
await client.connect();
const counts = await client.query<{ t: string; n: string }>(`
  SELECT 'universities' AS t, count(*)::text AS n FROM universities
  UNION ALL SELECT 'faculties', count(*)::text FROM faculties
  UNION ALL SELECT 'departments', count(*)::text FROM departments
  UNION ALL SELECT 'insights', count(*)::text FROM faculty_insights`);
await client.end();

console.log('\n✓ خلصت. اللي اتحط على Neon:');
for (const { t, n } of counts.rows) console.log(`   ${t.padEnd(14)} ${n}`);
