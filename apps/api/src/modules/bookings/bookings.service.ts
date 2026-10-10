/**
 * Bookings (Phase 15): pending → confirmed → completed / no_show, or cancelled (→ refunded, Phase 16).
 *
 * - Booking a slot creates a `pending` booking that holds it for BOOKING_HOLD_MINUTES while the
 *   student pays. The database's `bookings_no_overlap` exclusion constraint makes the hold atomic:
 *   two students racing for one slot → one wins, the other gets a clear 409.
 * - Unpaid holds expire (and free the slot); confirmed sessions nobody marked complete themselves
 *   AUTO_COMPLETE_HOURS after they end. `sweep()` does both and runs every minute.
 * - Cancellation refunds follow `cancellationRefund` (@sabeq/types): early or by the mentor → all,
 *   late by the student → half the session price. Money moves in Phase 16; here the share is recorded.
 * - Payments (Phase 16) confirm a booking through `confirmPaid` — only after the gateway's signed
 *   callback. Refunds start from `cancel` through the `onRefundDue` hook.
 * - Completing a session writes the mentor's earning to the append-only ledger.
 * Prices are snapshotted on the booking so later price changes never touch it.
 */
import {
  AUTO_COMPLETE_HOURS,
  BOOKING_HOLD_MINUTES,
  PLATFORM,
  SESSION_TYPES,
  STUDENT_FEE_PIASTERS,
  cancellationRefund,
  type SessionKind,
} from '@sabeq/types';
import { piasters, sessionPricePiasters, splitCommission } from '@sabeq/utils';
import { AppError, Errors } from '../../core/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../infra/db.js';
import { avatarUrl } from '../media/index.js';
import type { SchedulingService } from '../scheduling/scheduling.service.js';
import { SCHEDULING, slotsByDay } from '../scheduling/slots.js';

const MESSAGES = {
  mentorNotFound: 'المرشد ده مش موجود أو مش متاح دلوقتي.',
  notTaking: 'المرشد ده مش بياخد حجوزات دلوقتي.',
  noSession: 'المرشد ده مش بيقدّم النوع ده من الجلسات.',
  slotGone: 'الموعد ده مبقاش متاح. اختار موعد تاني من المواعيد اللي ظاهرة.',
  slotTaken: 'حد سبقك وحجز الموعد ده دلوقتي. اختار موعد تاني — مفيش أي فلوس اتخصمت.',
  youAreBusy: 'عندك جلسة تانية في نفس الوقت ده.',
  tooManyHolds: 'عندك حجوزات كتير مستنية الدفع. كمّل واحد منهم أو استنى لحد ما مهلته تخلص.',
  notFound: 'الحجز ده مش موجود.',
  notPending: 'الحجز ده مش مستني دفع.',
  holdExpired: 'مهلة الدفع خلصت والموعد اتفك. احجز تاني لو لسه متاح.',
  devOnly: 'الدفع التجريبي متاح على جهاز التطوير بس.',
  cantCancel: 'الحجز ده مينفعش يتلغي دلوقتي.',
  started: 'الجلسة بدأت بالفعل، مينفعش تتلغي.',
  needsName: 'اكتب اسمك في حسابك الأول — المرشد بيشوفه مع الحجز.',
  notEnded: 'تقدر تعلّم الجلسة بعد ما تخلص.',
  noShowTooEarly: 'تقدر تعلّم إن الطالب ما حضرش بعد 15 دقيقة من بداية الجلسة.',
  notConfirmed: 'الحجز ده مش جلسة مؤكدة.',
};

const MAX_PENDING_PER_STUDENT = 3;

const BOOKING_SELECT = {
  id: true,
  studentId: true,
  mentorId: true,
  kind: true,
  durationMin: true,
  medium: true,
  pricePiasters: true,
  feePiasters: true,
  totalPiasters: true,
  commissionBps: true,
  currency: true,
  startsAt: true,
  endsAt: true,
  status: true,
  holdExpiresAt: true,
  studentNote: true,
  cancelledAt: true,
  cancelReason: true,
  refundShareBps: true,
  completedAt: true,
  createdAt: true,
  cancelledBy: { select: { id: true } },
  payments: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { status: true, method: true, failureReason: true, kioskReference: true },
  },
  student: { select: { user: { select: { fullName: true } } } },
  mentor: {
    select: {
      slug: true,
      majorLabel: true,
      user: { select: { fullName: true, avatarKey: true } },
      faculty: { select: { nameAr: true, university: { select: { nameAr: true } } } },
    },
  },
} satisfies Prisma.BookingSelect;

type Row = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

function view(b: Row, viewer: 'student' | 'mentor') {
  const refund =
    b.status === 'cancelled' || b.status === 'refunded'
      ? b.refundShareBps === 10_000
        ? b.totalPiasters
        : b.refundShareBps
          ? Math.floor((b.pricePiasters * b.refundShareBps) / 10_000)
          : 0
      : null;
  return {
    id: b.id,
    kind: b.kind as SessionKind,
    label: SESSION_TYPES[b.kind as SessionKind].label,
    durationMin: b.durationMin,
    medium: b.medium,
    priceEgp: b.pricePiasters / 100,
    feeEgp: b.feePiasters / 100,
    totalEgp: b.totalPiasters / 100,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    status: b.status,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    note: b.studentNote,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    cancelReason: b.cancelReason,
    cancelledBy:
      b.cancelledBy === null
        ? null
        : b.cancelledBy.id === b.studentId
          ? 'student'
          : b.cancelledBy.id === b.mentorId
            ? 'mentor'
            : 'admin',
    refundEgp: refund === null ? null : refund / 100,
    /** The latest payment attempt (Phase 16). */
    payment: b.payments[0] ?? null,
    mentor: {
      slug: b.mentor.slug,
      name: b.mentor.user.fullName ?? 'مرشد سابق',
      photo: avatarUrl(b.mentor.user.avatarKey),
      major: b.mentor.majorLabel,
      faculty: b.mentor.faculty.nameAr,
      university: b.mentor.faculty.university.nameAr,
    },
    // The mentor sees who booked and what they earn (session price minus the commission).
    ...(viewer === 'mentor'
      ? {
          student: { name: b.student.user.fullName ?? 'طالب' },
          earningEgp:
            splitCommission(piasters(b.pricePiasters), b.commissionBps).mentorEarning / 100,
        }
      : {}),
  };
}

export type BookingView = ReturnType<typeof view>;

/** The Postgres exclusion constraint that guarantees one slot is never sold twice. */
const isOverlap = (err: unknown) =>
  /bookings_no_overlap|23P01|exclusion constraint/i.test(String((err as Error)?.message ?? err));

export function createBookingsService(deps: {
  db: Db;
  scheduling: SchedulingService;
  /** A paid booking was cancelled with money to return (payments module). */
  onRefundDue?: (bookingId: string) => Promise<void>;
  now?: () => Date;
}) {
  const { db, scheduling, now = () => new Date() } = deps;

  async function expireHolds(where: Prisma.BookingWhereInput = {}) {
    const at = now();
    return db.booking.updateMany({
      where: { ...where, status: 'pending', holdExpiresAt: { lt: at } },
      data: { status: 'cancelled', cancelledAt: at, cancelReason: 'انتهت مهلة الدفع' },
    });
  }

  async function completeBooking(tx: Prisma.TransactionClient, id: string, mentorId: string) {
    const done = await tx.booking.updateMany({
      where: { id, status: 'confirmed' },
      data: { status: 'completed', completedAt: now() },
    });
    if (done.count) {
      await tx.mentor.update({
        where: { userId: mentorId },
        data: { sessionsCompleted: { increment: 1 } },
      });
      // The mentor's earning: session price minus the commission (ADR-0009). Payable later.
      const b = await tx.booking.findUniqueOrThrow({
        where: { id },
        select: { pricePiasters: true, commissionBps: true },
      });
      await tx.ledgerEntry.create({
        data: {
          mentorId,
          bookingId: id,
          type: 'mentor_earning',
          amountPiasters: splitCommission(piasters(b.pricePiasters), b.commissionBps).mentorEarning,
        },
      });
    }
    return done.count === 1;
  }

  async function load(id: string) {
    const b = await db.booking.findUnique({ where: { id }, select: BOOKING_SELECT });
    if (!b) throw Errors.notFound(MESSAGES.notFound);
    return b;
  }

  async function notify(
    userId: string,
    type: string,
    title: string,
    body: string,
    bookingId: string,
  ) {
    await db.notification.create({ data: { userId, type, title, body, data: { bookingId } } });
  }

  const when = (d: Date) =>
    new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
      timeZone: PLATFORM.timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);

  return {
    /** Frees expired holds and completes unmarked sessions. Safe to run anywhere, any time. */
    async sweep() {
      const expired = await expireHolds();
      const due = await db.booking.findMany({
        where: {
          status: 'confirmed',
          endsAt: { lt: new Date(now().getTime() - AUTO_COMPLETE_HOURS * 3_600_000) },
        },
        select: { id: true, mentorId: true },
        take: 200,
      });
      let completed = 0;
      for (const b of due)
        if (await db.$transaction((tx) => completeBooking(tx, b.id, b.mentorId))) completed++;
      return { expired: expired.count, completed };
    },

    async create(
      studentId: string,
      input: { mentorSlug: string; kind: SessionKind; startsAt: string; note?: string | undefined },
    ) {
      const m = await db.mentor.findFirst({
        where: {
          slug: input.mentorSlug,
          isListed: true,
          user: { status: 'active', deletedAt: null },
        },
        select: {
          userId: true,
          acceptsBookings: true,
          basePricePiasters: true,
          offerings: {
            where: { kind: input.kind, isActive: true },
            select: { id: true, durationMin: true, medium: true },
          },
        },
      });
      if (!m) throw Errors.notFound(MESSAGES.mentorNotFound);
      const me = await db.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
      if (!me?.fullName) throw new AppError('CONFLICT', MESSAGES.needsName);
      if (!m.acceptsBookings || !m.basePricePiasters)
        throw new AppError('CONFLICT', MESSAGES.notTaking);
      const offering = m.offerings[0];
      if (!offering) throw Errors.validation({ kind: MESSAGES.noSession }, MESSAGES.noSession);

      // Free this mentor's stale holds first: the exclusion constraint counts every pending row.
      await expireHolds({ mentorId: m.userId });

      const startsAt = new Date(input.startsAt);
      const slots = slotsByDay({
        now: now(),
        durationMin: offering.durationMin,
        ...(await scheduling.load([m.userId], SCHEDULING.horizonDays))(m.userId),
      }).flatMap((d) => d.slots.map((s) => s.getTime()));
      if (!slots.includes(startsAt.getTime())) throw new AppError('CONFLICT', MESSAGES.slotGone);
      const endsAt = new Date(startsAt.getTime() + offering.durationMin * 60_000);

      const [overlapping, holds] = await Promise.all([
        db.booking.count({
          where: {
            studentId,
            OR: [{ status: 'confirmed' }, { status: 'pending', holdExpiresAt: { gt: now() } }],
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        }),
        db.booking.count({
          where: { studentId, status: 'pending', holdExpiresAt: { gt: now() } },
        }),
      ]);
      if (overlapping) throw new AppError('CONFLICT', MESSAGES.youAreBusy);
      if (holds >= MAX_PENDING_PER_STUDENT) throw new AppError('CONFLICT', MESSAGES.tooManyHolds);

      const price = sessionPricePiasters(m.basePricePiasters, SESSION_TYPES[input.kind].multiplier);
      try {
        const created = await db.booking.create({
          data: {
            studentId,
            mentorId: m.userId,
            offeringId: offering.id,
            kind: input.kind,
            durationMin: offering.durationMin,
            medium: offering.medium,
            pricePiasters: price,
            feePiasters: STUDENT_FEE_PIASTERS,
            totalPiasters: price + STUDENT_FEE_PIASTERS,
            commissionBps: PLATFORM.commissionBps,
            startsAt,
            endsAt,
            status: 'pending',
            holdExpiresAt: new Date(now().getTime() + BOOKING_HOLD_MINUTES * 60_000),
            studentNote: input.note || null,
          },
          select: BOOKING_SELECT,
        });
        return view(created, 'student');
      } catch (err) {
        if (isOverlap(err)) throw new AppError('CONFLICT', MESSAGES.slotTaken);
        throw err;
      }
    },

    /**
     * Payment received (signed gateway callback). Confirms the booking, or — when the hold had
     * already expired — confirms it if the slot is still free. Returns what happened, so the
     * payments module can refund a payment whose slot was taken meanwhile.
     */
    async confirmPaid(id: string): Promise<'confirmed' | 'already' | 'slot_taken' | 'cancelled'> {
      const b = await load(id);
      if (b.status === 'confirmed' || b.status === 'completed') return 'already';
      const expiredHold =
        b.status === 'cancelled' && b.refundShareBps === null && b.cancelledBy === null;
      if (b.status !== 'pending' && !expiredHold) return 'cancelled';
      try {
        const moved = await db.booking.updateMany({
          where: { id, status: b.status },
          data: { status: 'confirmed', holdExpiresAt: null, cancelledAt: null, cancelReason: null },
        });
        if (!moved.count) return 'already';
      } catch (err) {
        if (isOverlap(err)) return 'slot_taken';
        throw err;
      }
      await notify(
        b.mentorId,
        'booking.confirmed',
        'حجز جديد',
        `${b.student.user.fullName ?? 'طالب'} حجز ${SESSION_TYPES[b.kind as SessionKind].label} يوم ${when(b.startsAt)}.`,
        id,
      );
      return 'confirmed';
    },

    /** The hold, for the payments module (kiosk payments need longer). */
    async holdFor(studentId: string, id: string) {
      const b = await load(id);
      if (b.studentId !== studentId) throw Errors.notFound(MESSAGES.notFound);
      if (b.status !== 'pending') throw new AppError('CONFLICT', MESSAGES.notPending);
      if (!b.holdExpiresAt || b.holdExpiresAt < now()) {
        await expireHolds({ id });
        throw new AppError('CONFLICT', MESSAGES.holdExpired);
      }
      return b;
    },

    async cancel(userId: string, id: string, reason: string | undefined) {
      const b = await load(id);
      const by = b.studentId === userId ? 'student' : b.mentorId === userId ? 'mentor' : null;
      if (!by) throw Errors.notFound(MESSAGES.notFound);
      if (b.status !== 'pending' && b.status !== 'confirmed')
        throw new AppError('CONFLICT', MESSAGES.cantCancel);
      if (b.startsAt <= now()) throw new AppError('CONFLICT', MESSAGES.started);

      const refund = cancellationRefund({
        status: b.status,
        by,
        hoursBefore: (b.startsAt.getTime() - now().getTime()) / 3_600_000,
        pricePiasters: b.pricePiasters,
        feePiasters: b.feePiasters,
      });
      const moved = await db.booking.updateMany({
        where: { id, status: b.status },
        data: {
          status: 'cancelled',
          cancelledAt: now(),
          cancelledById: userId,
          cancelReason: reason || null,
          refundShareBps: b.status === 'confirmed' ? refund.shareBps : null,
          holdExpiresAt: null,
        },
      });
      if (!moved.count) throw new AppError('CONFLICT', MESSAGES.cantCancel);
      if (b.status === 'confirmed' && refund.refundPiasters > 0 && deps.onRefundDue)
        // A gateway hiccup must not undo the cancellation: the refund stays pending and is retried.
        await deps.onRefundDue(id).catch(() => undefined);
      if (b.status === 'confirmed') {
        const other = by === 'student' ? b.mentorId : b.studentId;
        await notify(
          other,
          'booking.cancelled',
          'جلسة اتلغت',
          by === 'student'
            ? `${b.student.user.fullName ?? 'الطالب'} لغى جلسة ${when(b.startsAt)}.`
            : `${b.mentor.user.fullName ?? 'المرشد'} لغى جلسة ${when(b.startsAt)}، وهترجعلك فلوسك كاملة.`,
          id,
        );
      }
      return view(await load(id), by);
    },

    /** The mentor marks a finished session as done. */
    async complete(mentorId: string, id: string) {
      const b = await load(id);
      if (b.mentorId !== mentorId) throw Errors.notFound(MESSAGES.notFound);
      if (b.status !== 'confirmed') throw new AppError('CONFLICT', MESSAGES.notConfirmed);
      if (b.endsAt > now()) throw new AppError('CONFLICT', MESSAGES.notEnded);
      await db.$transaction((tx) => completeBooking(tx, id, mentorId));
      return view(await load(id), 'mentor');
    },

    /** The student never joined (15 minutes after the start at the earliest). */
    async noShow(mentorId: string, id: string) {
      const b = await load(id);
      if (b.mentorId !== mentorId) throw Errors.notFound(MESSAGES.notFound);
      if (b.status !== 'confirmed') throw new AppError('CONFLICT', MESSAGES.notConfirmed);
      if (b.startsAt.getTime() + 15 * 60_000 > now().getTime())
        throw new AppError('CONFLICT', MESSAGES.noShowTooEarly);
      await db.booking.update({ where: { id }, data: { status: 'no_show' } });
      return view(await load(id), 'mentor');
    },

    async list(userId: string, role: 'student' | 'mentor', scope: 'upcoming' | 'past') {
      await expireHolds(role === 'student' ? { studentId: userId } : { mentorId: userId });
      const mine: Prisma.BookingWhereInput =
        role === 'student' ? { studentId: userId } : { mentorId: userId };
      const live: Prisma.BookingWhereInput = {
        OR: [
          { status: 'confirmed' },
          // Students see their own unpaid holds; mentors only confirmed sessions.
          ...(role === 'student'
            ? [{ status: 'pending' as const, holdExpiresAt: { gt: now() } }]
            : []),
        ],
        endsAt: { gt: now() },
      };
      const rows = await db.booking.findMany({
        where: scope === 'upcoming' ? { ...mine, ...live } : { ...mine, NOT: live },
        orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
        take: 100,
        select: BOOKING_SELECT,
      });
      // History leaves out bookings that were never paid (expired holds, unpaid cancellations):
      // they never became sessions. refundShareBps is set only when a paid booking is cancelled.
      const neverPaid = (b: Row) => b.status === 'cancelled' && b.refundShareBps === null;
      return rows.filter((b) => scope === 'upcoming' || !neverPaid(b)).map((b) => view(b, role));
    },

    async get(userId: string, id: string) {
      const b = await load(id);
      if (b.studentId === userId) return view(b, 'student');
      if (b.mentorId === userId) return view(b, 'mentor');
      throw Errors.notFound(MESSAGES.notFound);
    },
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;
