/**
 * Availability & scheduling (Phase 14).
 *
 * - The mentor keeps weekly hours (rules) and date exceptions (a blocked day / hours, or extra
 *   hours on a date). Changes never touch existing bookings.
 * - Students see bookable slots per session type, computed by `slots.ts` from those hours minus
 *   pending / confirmed bookings. Phase 15 books a slot; the database's `bookings_no_overlap`
 *   exclusion constraint guarantees it can't be sold twice even under concurrent requests.
 */
import { SESSION_TYPES, type SessionKind } from '@sabeq/types';
import { addDays, cairoDate } from '@sabeq/utils';
import { Errors } from '../../core/errors.js';
import type { Db } from '../../infra/db.js';
import {
  SCHEDULING,
  nextSlot,
  rulesProblem,
  slotsByDay,
  type Busy,
  type Exception,
  type Rule,
} from './slots.js';

const MESSAGES = {
  noProfile: 'لسه مالكش ملف مرشد. ملفك بيتعمل لما طلب انضمامك يتقبل.',
  notFound: 'المرشد ده مش موجود أو مش متاح دلوقتي.',
  noSession: 'المرشد ده مش بيقدّم النوع ده من الجلسات.',
  exceptionNotFound: 'الاستثناء ده مش موجود.',
  pastDate: 'اختار تاريخ من النهارده لقدّام.',
  farDate: 'تقدر تعدّل لحد 90 يوم قدّام بس.',
  extraNeedsHours: 'حدد الساعات اللي هتضيفها.',
  tooMany: 'عندك استثناءات كتير. امسح القديم الأول.',
};

const toDay = (d: Date) => d.toISOString().slice(0, 10);
const fromDay = (s: string) => new Date(`${s}T00:00:00Z`);

export interface ExceptionInput {
  date: string;
  kind: 'blocked' | 'extra';
  startMinute?: number | null | undefined;
  endMinute?: number | null | undefined;
}

export function createSchedulingService({
  db,
  now = () => new Date(),
}: {
  db: Db;
  now?: () => Date;
}) {
  /** Rules, future exceptions and busy time of several mentors, in three queries. */
  async function load(mentorIds: string[], horizonDays: number) {
    const today = cairoDate(now());
    const end = fromDay(addDays(today, horizonDays + 1));
    const [rules, exceptions, bookings] = await Promise.all([
      db.availabilityRule.findMany({
        where: { mentorId: { in: mentorIds } },
        select: { mentorId: true, weekday: true, startMinute: true, endMinute: true },
      }),
      db.availabilityException.findMany({
        where: { mentorId: { in: mentorIds }, date: { gte: fromDay(today), lt: end } },
        select: { mentorId: true, date: true, kind: true, startMinute: true, endMinute: true },
      }),
      db.booking.findMany({
        where: {
          mentorId: { in: mentorIds },
          status: { in: ['pending', 'confirmed'] },
          endsAt: { gt: now() },
          startsAt: { lt: end },
        },
        select: { mentorId: true, startsAt: true, endsAt: true },
      }),
    ]);
    const by = <T extends { mentorId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.mentorId, [...(m.get(r.mentorId) ?? []), r]);
      return m;
    };
    const r = by(rules);
    const e = by(exceptions);
    const b = by(bookings);
    return (id: string) => ({
      rules: (r.get(id) ?? []) as Rule[],
      exceptions: (e.get(id) ?? []).map((x): Exception => ({
        ...x,
        date: toDay(x.date),
        kind: x.kind,
      })),
      busy: (b.get(id) ?? []) as Busy[],
    });
  }

  async function mentorIdOf(userId: string) {
    const m = await db.mentor.findUnique({ where: { userId }, select: { userId: true } });
    if (!m) throw Errors.notFound(MESSAGES.noProfile);
    return m.userId;
  }

  async function own(userId: string) {
    await mentorIdOf(userId);
    const data = (await load([userId], SCHEDULING.horizonDays))(userId);
    const exceptions = await db.availabilityException.findMany({
      where: { mentorId: userId, date: { gte: fromDay(cairoDate(now())) } },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      select: { id: true, date: true, kind: true, startMinute: true, endMinute: true },
    });
    const upcoming = slotsByDay({ now: now(), durationMin: 45, ...data })
      .flatMap((d) => d.slots)
      .slice(0, 6)
      .map((d) => d.toISOString());
    return {
      timezone: 'Africa/Cairo',
      rules: data.rules
        .map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute }))
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
      exceptions: exceptions.map((x) => ({ ...x, date: toDay(x.date) })),
      /** What students will see first (45-minute consultation). */
      upcoming,
      limits: SCHEDULING,
    };
  }

  return {
    load,

    /** First bookable consultation slot of each mentor (cards, «متاح الأسبوع ده»). */
    async nextSlots(mentorIds: string[]): Promise<Map<string, Date | null>> {
      if (!mentorIds.length) return new Map();
      const get = await load(mentorIds, SCHEDULING.horizonDays);
      const at = now();
      return new Map(
        mentorIds.map((id) => [
          id,
          nextSlot({ now: at, durationMin: SESSION_TYPES.consultation.durationMin, ...get(id) }),
        ]),
      );
    },

    /** Bookable slots of a listed mentor for one session type, day by day. */
    async availability(slug: string, kind: SessionKind) {
      const m = await db.mentor.findFirst({
        where: { slug, isListed: true, user: { status: 'active', deletedAt: null } },
        select: {
          userId: true,
          acceptsBookings: true,
          offerings: { where: { kind, isActive: true }, select: { durationMin: true } },
        },
      });
      if (!m) return null;
      const offering = m.offerings[0];
      if (!offering) throw Errors.validation({ kind: MESSAGES.noSession }, MESSAGES.noSession);
      const days = m.acceptsBookings
        ? slotsByDay({
            now: now(),
            durationMin: offering.durationMin,
            ...(await load([m.userId], SCHEDULING.horizonDays))(m.userId),
          })
        : [];
      const all = days.flatMap((d) => d.slots);
      return {
        timezone: 'Africa/Cairo',
        kind,
        durationMin: offering.durationMin,
        acceptsBookings: m.acceptsBookings,
        next: all[0]?.toISOString() ?? null,
        days: days.map((d) => ({ date: d.date, slots: d.slots.map((s) => s.toISOString()) })),
      };
    },

    // ---------- the mentor's own hours ----------

    own,

    async setRules(userId: string, rules: Rule[]) {
      await mentorIdOf(userId);
      const problem = rulesProblem(rules);
      if (problem) throw Errors.validation({ rules: problem }, problem);
      await db.$transaction([
        db.availabilityRule.deleteMany({ where: { mentorId: userId } }),
        db.availabilityRule.createMany({ data: rules.map((r) => ({ ...r, mentorId: userId })) }),
      ]);
      return own(userId);
    },

    async addException(userId: string, input: ExceptionInput) {
      await mentorIdOf(userId);
      const today = cairoDate(now());
      if (input.date < today)
        throw Errors.validation({ date: MESSAGES.pastDate }, MESSAGES.pastDate);
      if (input.date > addDays(today, 90))
        throw Errors.validation({ date: MESSAGES.farDate }, MESSAGES.farDate);
      const hasHours = typeof input.startMinute === 'number' && typeof input.endMinute === 'number';
      if (input.kind === 'extra' && !hasHours)
        throw Errors.validation(
          { startMinute: MESSAGES.extraNeedsHours },
          MESSAGES.extraNeedsHours,
        );
      if (hasHours) {
        const problem = rulesProblem([
          { weekday: 0, startMinute: input.startMinute ?? 0, endMinute: input.endMinute ?? 0 },
        ]);
        if (problem && input.kind === 'extra')
          throw Errors.validation({ startMinute: problem }, problem);
      }
      const count = await db.availabilityException.count({
        where: { mentorId: userId, date: { gte: fromDay(today) } },
      });
      if (count >= 60) throw Errors.validation(undefined, MESSAGES.tooMany);
      await db.availabilityException.create({
        data: {
          mentorId: userId,
          date: fromDay(input.date),
          kind: input.kind,
          startMinute: hasHours ? (input.startMinute ?? null) : null,
          endMinute: hasHours ? (input.endMinute ?? null) : null,
        },
      });
      return own(userId);
    },

    async deleteException(userId: string, id: string) {
      const removed = await db.availabilityException.deleteMany({
        where: { id, mentorId: userId },
      });
      if (!removed.count) throw Errors.notFound(MESSAGES.exceptionNotFound);
      return own(userId);
    },
  };
}

export type SchedulingService = ReturnType<typeof createSchedulingService>;
