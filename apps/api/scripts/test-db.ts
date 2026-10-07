/**
 * `pnpm --filter @sabeq/api test:db` — integration tests against a real PostgreSQL.
 *
 * Uses a separate database named `<DATABASE_URL db>_test` on the same server, recreated from the
 * migrations on every run, so development data is never touched. Refuses to run unless the target
 * database name ends with `_test`.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = path.join(import.meta.dirname, '../../..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const base = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!base) throw new Error('DATABASE_URL is not set');

const testUrl = new URL(base);
const devDb = testUrl.pathname.slice(1);
const testDb = devDb.endsWith('_test') ? devDb : `${devDb}_test`;
testUrl.pathname = `/${testDb}`;
if (!testDb.endsWith('_test')) throw new Error(`refusing to reset non-test database ${testDb}`);

const admin = new URL(base);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${testDb}"`);
await client.end();

const env = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  DATABASE_DIRECT_URL: testUrl.toString(),
  APP_ENV: 'staging',
};
// Run the CLIs' JS entry points with this Node — no shell, no argument concatenation.
const require = createRequire(import.meta.url);
const run = (bin: string, args: string[]) => {
  const r = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
// The catalog (universities, faculty kinds …) is reference data tests rely on; demo mentors are not.
run(require.resolve('tsx/cli'), [path.join(import.meta.dirname, '../prisma/seed.ts')]);
run(path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs'), [
  'run',
  '--config',
  'vitest.db.config.ts',
]);
