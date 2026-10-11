/**
 * Direct database access for what a browser can't do in a test's time: move a session to "now",
 * end it, or create the admin who signs in. Local / CI databases only.
 */
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

/** An admin account for this phone (as `pnpm admin:create` would). */
export async function ensureAdmin(phone: string, role = 'super_admin', name = 'أدمن الاختبارات') {
  const [user] = await sql<{ id: string }>(
    `INSERT INTO users (id, phone, role, full_name, updated_at)
     VALUES (gen_random_uuid(), $1, 'admin', $2, now())
     ON CONFLICT (phone) DO UPDATE SET status = 'active' RETURNING id`,
    [e164(phone), name],
  );
  await sql(
    `INSERT INTO admins (user_id, admin_role) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role`,
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
    `INSERT INTO users (id, phone, role, full_name, updated_at)
     VALUES (gen_random_uuid(), $1, 'mentor', $2, now()) RETURNING id`,
    [e164(phone), name],
  );
  const id = user?.id;
  const slug = `e2e-${phone.slice(-8)}`;
  await sql(
    `INSERT INTO mentors (user_id, slug, kind, faculty_id, major_label, base_price_piasters,
       is_listed, listed_at, accepts_bookings, bio, updated_at)
     VALUES ($1, $2, 'graduate', $3, 'طب وجراحة', 20000, true, now(), true,
       'مرشد اختبارات آلية.', now())`,
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
