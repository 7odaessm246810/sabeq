/**
 * The database itself must refuse invalid money and booking states — even if service code has a bug.
 * These tests talk to a real PostgreSQL (scripts/test-db.ts).
 */
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './db.js';

const url = process.env.DATABASE_URL;
if (!url?.includes('_test'))
  throw new Error('constraints.db.test.ts must run against a *_test database');

const db = createDb({ url, poolMax: 4, logger: pino({ level: 'silent' }) });

let mentorId = '';
let studentId = '';
let otherStudentId = '';

const at = (iso: string) => new Date(iso);
const PRICE = 25_000;
const FEE = 1_500;

function booking(overrides: Record<string, unknown> = {}) {
  return {
    studentId,
    mentorId,
    kind: 'consultation' as const,
    durationMin: 45,
    medium: 'video' as const,
    pricePiasters: PRICE,
    feePiasters: FEE,
    totalPiasters: PRICE + FEE,
    commissionBps: 1000,
    startsAt: at('2026-10-08T16:00:00Z'),
    endsAt: at('2026-10-08T16:45:00Z'),
    ...overrides,
  };
}

/** Postgres error text of a rejected Prisma call. */
async function rejection(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    return String((err as Error).message) + JSON.stringify(err);
  }
  throw new Error('expected the database to reject this write');
}

beforeAll(async () => {
  const uni = await db.university.create({
    data: { slug: 'test-uni', nameAr: 'جامعة اختبار', type: 'public', governorate: 'القاهرة' },
  });
  const kind = await db.facultyKind.create({
    data: {
      slug: 'test-kind',
      nameAr: 'اختبار',
      fullNameAr: 'كلية اختبار',
      icon: 'gear',
      category: 'engineering',
      studyYears: 5,
      summary: '-',
      about: '-',
      genericInfo: '-',
    },
  });
  const faculty = await db.faculty.create({
    data: { universityId: uni.id, kindId: kind.id, nameAr: 'كلية اختبار القيود' },
  });

  const mentorUser = await db.user.create({
    data: { phone: '+201099900001', role: 'mentor', fullName: 'مرشد اختبار' },
  });
  await db.mentor.create({
    data: {
      userId: mentorUser.id,
      slug: 'test-mentor',
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'اختبار',
      basePricePiasters: PRICE,
    },
  });
  mentorId = mentorUser.id;

  for (const [i, phone] of ['+201099900002', '+201099900003'].entries()) {
    const u = await db.user.create({ data: { phone, role: 'student', fullName: `طالب ${i}` } });
    await db.student.create({ data: { userId: u.id } });
    if (i === 0) studentId = u.id;
    else otherStudentId = u.id;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

describe('bookings', () => {
  it('rejects a second booking that overlaps an active one (no double booking)', async () => {
    await db.booking.create({ data: booking() });
    const err = await rejection(
      db.booking.create({
        data: booking({
          studentId: otherStudentId,
          startsAt: at('2026-10-08T16:30:00Z'),
          endsAt: at('2026-10-08T17:15:00Z'),
        }),
      }),
    );
    expect(err).toMatch(/bookings_no_overlap|exclusion|23P01/);
  });

  it('allows back-to-back sessions (end = next start)', async () => {
    await expect(
      db.booking.create({
        data: booking({ startsAt: at('2026-10-08T16:45:00Z'), endsAt: at('2026-10-08T17:30:00Z') }),
      }),
    ).resolves.toBeDefined();
  });

  it('frees the slot once a booking is cancelled', async () => {
    const b = await db.booking.create({
      data: booking({ startsAt: at('2026-10-09T16:00:00Z'), endsAt: at('2026-10-09T16:45:00Z') }),
    });
    await db.booking.update({ where: { id: b.id }, data: { status: 'cancelled' } });
    await expect(
      db.booking.create({
        data: booking({
          studentId: otherStudentId,
          startsAt: at('2026-10-09T16:00:00Z'),
          endsAt: at('2026-10-09T16:45:00Z'),
        }),
      }),
    ).resolves.toBeDefined();
  });

  it('rejects totals that do not add up and reversed times', async () => {
    expect(
      await rejection(
        db.booking.create({
          data: booking({
            totalPiasters: 1,
            startsAt: at('2026-10-10T10:00:00Z'),
            endsAt: at('2026-10-10T10:45:00Z'),
          }),
        }),
      ),
    ).toMatch(/bookings_amounts|23514/);
    expect(
      await rejection(
        db.booking.create({
          data: booking({
            startsAt: at('2026-10-10T12:00:00Z'),
            endsAt: at('2026-10-10T11:00:00Z'),
          }),
        }),
      ),
    ).toMatch(/bookings_time_order|23514/);
  });
});

describe('money history is append-only', () => {
  it('ledger entries cannot be changed or deleted', async () => {
    const entry = await db.ledgerEntry.create({
      data: { mentorId, type: 'mentor_earning', amountPiasters: 22_500 },
    });
    expect(
      await rejection(
        db.ledgerEntry.update({ where: { id: entry.id }, data: { amountPiasters: 1 } }),
      ),
    ).toMatch(/append-only/);
    expect(await rejection(db.ledgerEntry.delete({ where: { id: entry.id } }))).toMatch(
      /append-only/,
    );
  });

  it('audit log entries cannot be changed', async () => {
    const log = await db.auditLog.create({
      data: { actorRole: 'system', action: 'test', entityType: 'test', entityId: '1' },
    });
    expect(
      await rejection(db.auditLog.update({ where: { id: log.id }, data: { action: 'tampered' } })),
    ).toMatch(/append-only/);
  });
});

describe('value rules', () => {
  it('mentor base price stays within 100–500 EGP', async () => {
    expect(
      await rejection(
        db.mentor.update({ where: { userId: mentorId }, data: { basePricePiasters: 1_000 } }),
      ),
    ).toMatch(/mentors_base_price|23514/);
  });

  it('ratings are 1–5 and one review per booking', async () => {
    const b = await db.booking.create({
      data: booking({
        status: 'completed',
        startsAt: at('2026-10-01T10:00:00Z'),
        endsAt: at('2026-10-01T10:45:00Z'),
      }),
    });
    expect(
      await rejection(
        db.review.create({ data: { bookingId: b.id, studentId, mentorId, rating: 6 } }),
      ),
    ).toMatch(/reviews_rating|23514/);
    await db.review.create({ data: { bookingId: b.id, studentId, mentorId, rating: 5 } });
    expect(
      await rejection(
        db.review.create({ data: { bookingId: b.id, studentId, mentorId, rating: 4 } }),
      ),
    ).toMatch(/P2002|Unique constraint/);
  });

  it('phones must be E.164 and unique', async () => {
    expect(
      await rejection(
        db.user.create({ data: { phone: '01012345678', role: 'student', fullName: 'Test User' } }),
      ),
    ).toMatch(/users_phone_e164|23514/);
    expect(
      await rejection(
        db.user.create({
          data: { phone: '+201099900001', role: 'student', fullName: 'Test User' },
        }),
      ),
    ).toMatch(/P2002|Unique constraint/);
  });

  it('availability windows must be inside the day and start before they end', async () => {
    expect(
      await rejection(
        db.availabilityRule.create({
          data: { mentorId, weekday: 7, startMinute: 600, endMinute: 660 },
        }),
      ),
    ).toMatch(/availability_rules_weekday|23514/);
    expect(
      await rejection(
        db.availabilityRule.create({
          data: { mentorId, weekday: 1, startMinute: 700, endMinute: 600 },
        }),
      ),
    ).toMatch(/availability_rules_window|23514/);
  });
});
