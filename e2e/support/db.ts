/**
 * Direct database access for what a browser can't do in a test's time: move a session to "now",
 * end it, confirm an email, or create the admin who signs in. Local / CI databases only.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';
import { DATABASE_URL } from './env.js';

let pool: pg.Pool | undefined;
const db = () => (pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 2 }));

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return (await db().query<T>(text, values)).rows;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

const e164 = (local: string) => `+20${local.slice(1)}`;

/**
 * Journeys name people by a fresh phone number (unique per run); since ADR-0017 they sign in with an
 * email made from it and this password.
 */
export const emailFor = (phone: string) => `e2e-${phone}@test.sabeq`;
export const E2E_PASSWORD = 'e2e-password-123';

/** The API's scrypt format (apps/api/src/modules/auth/password.ts), for accounts made here. */
function passwordHash(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 3, maxmem: 256 * 2 ** 15 * 8 });
  return ['scrypt', 2 ** 15, 8, 3, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function accountExists(phone: string) {
  const rows = await sql('SELECT 1 FROM users WHERE email = $1', [emailFor(phone)]);
  return rows.length > 0;
}

/**
 * Right after signing up in the browser: the phone (journeys look people up by it), and the email
 * confirmed (clicking the emailed link is covered by the API tests).
 */
export async function afterSignUp(phone: string) {
  await sql('UPDATE users SET phone = $2, email_verified_at = now() WHERE email = $1', [
    emailFor(phone),
    e164(phone),
  ]);
}

/** The user id behind a local phone number (01…). */
export async function userId(phone: string) {
  const [row] = await sql<{ id: string }>('SELECT id FROM users WHERE phone = $1', [e164(phone)]);
  if (!row) throw new Error(`no user for ${phone}`);
  return row.id;
}

/** A booking of this student, newest first. */
export async function latestBooking(studentPhone: string) {
  const [row] = await sql<{ id: string; status: string }>(
    `SELECT b.id, b.status FROM bookings b JOIN users u ON u.id = b.student_id
     WHERE u.phone = $1 ORDER BY b.created_at DESC LIMIT 1`,
    [e164(studentPhone)],
  );
  if (!row) throw new Error(`no booking for ${studentPhone}`);
  return row;
}

/** Moves a session so it starts `minutesFromNow` (negative: already started). */
export async function moveSession(bookingId: string, minutesFromNow: number) {
  await sql(
    `UPDATE bookings SET starts_at = now() + make_interval(mins => $2),
       ends_at = now() + make_interval(mins => $2 + duration_min), reminder_sent_at = NULL
     WHERE id = $1`,
    [bookingId, minutesFromNow],
  );
}

/**
 * An admin account for this phone (as `pnpm admin:create` + its password link would), with no app
 * code yet — so the journey sets one up on its first sign-in.
 */
export async function ensureAdmin(phone: string, role = 'super_admin', name = 'أدمن الاختبارات') {
  const [user] = await sql<{ id: string }>(
    `INSERT INTO users (id, phone, email, email_verified_at, password_hash, role, full_name, updated_at)
     VALUES (gen_random_uuid(), $1, $2, now(), $3, 'admin', $4, now())
     ON CONFLICT (email) DO UPDATE SET status = 'active', password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [e164(phone), emailFor(phone), passwordHash(E2E_PASSWORD), name],
  );
  await sql(
    `INSERT INTO admins (user_id, admin_role) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role,
       totp_secret_enc = NULL, totp_enabled_at = NULL`,
    [user?.id, role],
  );
}

/**
 * A listed mentor of its own for each journey (graduate, Cairo medicine, 200 EGP, open all day every
 * day), so journeys never compete with demo data or each other for slots. Returns the slug.
 */
export async function createMentor(phone: string, name: string) {
  const [faculty] = await sql<{ id: string }>(
    `SELECT f.id FROM faculties f JOIN universities u ON u.id = f.university_id
     JOIN faculty_kinds k ON k.id = f.kind_id WHERE u.slug = 'cairo' AND k.slug = 'med' LIMIT 1`,
  );
  if (!faculty) throw new Error('catalog not seeded (no Cairo medicine)');
  const [user] = await sql<{ id: string }>(
    `INSERT INTO users (id, phone, email, email_verified_at, password_hash, role, full_name, updated_at)
     VALUES (gen_random_uuid(), $1, $2, now(), $3, 'mentor', $4, now()) RETURNING id`,
    [e164(phone), emailFor(phone), passwordHash(E2E_PASSWORD), name],
  );
  const id = user?.id;
  const slug = `e2e-${phone.slice(-8)}`;
  await sql(
    `INSERT INTO mentors (user_id, slug, kind, faculty_id, major_label, base_price_piasters,
       is_listed, listed_at, accepts_bookings, bio, updated_at)
     VALUES ($1, $2, 'graduate', $3, 'طب وجراحة', 20000, true, now(), true,
       'مستشار اختبارات آلية.', now())`,
    [id, slug, faculty.id],
  );
  await sql(
    `INSERT INTO session_offerings (id, mentor_id, kind, duration_min, medium)
     VALUES (gen_random_uuid(), $1, 'consultation', 45, 'video')`,
    [id],
  );
  for (let weekday = 0; weekday < 7; weekday++)
    await sql(
      `INSERT INTO availability_rules (id, mentor_id, weekday, start_minute, end_minute)
       VALUES (gen_random_uuid(), $1, $2, 0, 1440)`,
      [id, weekday],
    );
  return slug;
}

/** An earning on the mentor's ledger (as a completed session writes it). */
export async function addEarning(mentorPhone: string, piasters: number) {
  await sql(
    `INSERT INTO ledger_entries (id, mentor_id, type, amount_piasters)
     VALUES (gen_random_uuid(), (SELECT id FROM users WHERE phone = $1), 'mentor_earning', $2)`,
    [e164(mentorPhone), piasters],
  );
}
