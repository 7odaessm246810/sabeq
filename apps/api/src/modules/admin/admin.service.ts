/**
 * The admin dashboard (Phase 20): the numbers, and the support tools — bookings (a full refund to
 * settle a dispute), reviews (hide / restore) and accounts (suspend / reactivate). Every change is
 * audited; reading is not (except what is sensitive, elsewhere).
 */
import { SESSION_TYPES, type SessionKind } from '@sabeq/types';
import {
  cairoDate,
  cairoToInstant,
  formatEgyptianMobile,
  normalizeEgyptianMobile,
  splitCommission,
  piasters,
} from '@sabeq/utils';
import { AppError, Errors } from '../../core/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  AccountStatus,
  BookingStatus,
  ReviewStatus,
  UserRole,
} from '../../generated/prisma/enums.js';
import type { Db } from '../../infra/db.js';
import type { SessionService } from '../auth/session.service.js';
import type { BookingsService } from '../bookings/bookings.service.js';
import { recomputeRating } from '../reviews/reviews.service.js';
import { writeAudit, type AdminActor } from './audit.js';

const MESSAGES = {
  bookingNotFound: 'الحجز ده مش موجود.',
  reviewNotFound: 'التقييم ده مش موجود.',
  userNotFound: 'الحساب ده مش موجود.',
  notAdmins: 'حسابات الأدمن بتتدار من سطر الأوامر، مش من هنا.',
  same: 'الحساب بالفعل على الحالة دي.',
};

const PAGE_SIZE = 30;
const DAY = 86_400_000;

/** Cairo midnight at the start of today and of this month, as instants. */
function cairoStarts(now: Date) {
  const today = cairoDate(now);
  return { today: cairoToInstant(today, 0), month: cairoToInstant(`${today.slice(0, 8)}01`, 0) };
}

export function createAdminService(deps: {
  db: Db;
  sessions: SessionService;
  bookings: Pick<BookingsService, 'adminRefund'>;
  /** Mentor cards carry ratings and visibility: refresh them. */
  onMentorsChanged?: () => void;
  now?: () => Date;
}) {
  const { db, sessions, bookings, now = () => new Date() } = deps;

  return {
    async overview() {
      const at = now();
      const { today, month } = cairoStarts(at);
      const sum = (rows: { _sum: { amountPiasters: number | null } }) =>
        (rows._sum.amountPiasters ?? 0) / 100;
      const [
        students,
        mentorsListed,
        applicationsWaiting,
        upcoming,
        sessionsToday,
        bookedThisMonth,
        completedThisMonth,
        paidThisMonth,
        refundedThisMonth,
        refundsPending,
        owed,
        completedRows,
        reviewsHidden,
      ] = await Promise.all([
        db.user.count({ where: { role: 'student', status: 'active' } }),
        db.mentor.count({ where: { isListed: true } }),
        db.mentorApplication.count({ where: { status: { in: ['submitted', 'under_review'] } } }),
        db.booking.count({ where: { status: 'confirmed', startsAt: { gt: at } } }),
        db.booking.count({
          where: {
            status: { in: ['confirmed', 'completed', 'no_show'] },
            startsAt: { gte: today, lt: new Date(today.getTime() + DAY) },
          },
        }),
        db.booking.count({
          where: {
            createdAt: { gte: month },
            payments: { some: { status: { not: 'pending' } } },
            NOT: { status: 'pending' },
          },
        }),
        db.booking.count({ where: { status: 'completed', completedAt: { gte: month } } }),
        db.payment.aggregate({
          where: {
            succeededAt: { gte: month },
            status: { in: ['succeeded', 'refunded', 'partially_refunded'] },
          },
          _sum: { amountPiasters: true },
        }),
        db.refund.aggregate({
          where: { status: 'succeeded', createdAt: { gte: month } },
          _sum: { amountPiasters: true },
        }),
        db.refund.count({ where: { status: 'pending' } }),
        db.ledgerEntry.aggregate({ _sum: { amountPiasters: true } }),
        db.booking.findMany({
          where: { status: 'completed', completedAt: { gte: month } },
          select: { pricePiasters: true, commissionBps: true, feePiasters: true },
        }),
        db.review.count({ where: { status: 'hidden' } }),
      ]);
      // What Sabeq keeps from this month's completed sessions: the commission and the student fee.
      const kept = completedRows.reduce(
        (n, b) =>
          n +
          splitCommission(piasters(b.pricePiasters), b.commissionBps).platformFee +
          b.feePiasters,
        0,
      );
      return {
        people: { students, mentorsListed, applicationsWaiting },
        sessions: { upcoming, today: sessionsToday, bookedThisMonth, completedThisMonth },
        money: {
          paidThisMonthEgp: sum(paidThisMonth),
          refundedThisMonthEgp: sum(refundedThisMonth),
          keptThisMonthEgp: kept / 100,
          owedToMentorsEgp: sum(owed),
          refundsPending,
        },
        reviewsHidden,
      };
    },

    // ---------- bookings ----------

    async listBookings(q: {
      status?: BookingStatus | undefined;
      q?: string | undefined;
      page: number;
    }) {
      const phone = q.q ? normalizeEgyptianMobile(q.q) : null;
      const where: Prisma.BookingWhereInput = {
        ...(q.status ? { status: q.status } : { NOT: { status: 'pending' } }),
        ...(q.q
          ? {
              OR: [
                ...(/^[0-9a-f-]{36}$/i.test(q.q) ? [{ id: q.q }] : []),
                ...(phone
                  ? [{ student: { user: { phone } } }, { mentor: { user: { phone } } }]
                  : [
                      {
                        student: {
                          user: { fullName: { contains: q.q, mode: 'insensitive' as const } },
                        },
                      },
                      {
                        mentor: {
                          user: { fullName: { contains: q.q, mode: 'insensitive' as const } },
                        },
                      },
                    ]),
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        db.booking.count({ where }),
        db.booking.findMany({
          where,
          orderBy: { startsAt: 'desc' },
          skip: (q.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            kind: true,
            status: true,
            startsAt: true,
            totalPiasters: true,
            student: { select: { user: { select: { fullName: true } } } },
            mentor: { select: { user: { select: { fullName: true } } } },
            payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
          },
        }),
      ]);
      return {
        items: rows.map((b) => ({
          id: b.id,
          label: SESSION_TYPES[b.kind as SessionKind].label,
          status: b.status,
          startsAt: b.startsAt.toISOString(),
          totalEgp: b.totalPiasters / 100,
          student: b.student.user.fullName ?? 'طالب',
          mentor: b.mentor.user.fullName ?? 'مرشد',
          payment: b.payments[0]?.status ?? null,
        })),
        page: { page: q.page, pageSize: PAGE_SIZE, total },
      };
    },

    async getBooking(id: string) {
      const b = await db.booking.findUnique({
        where: { id },
        select: {
          id: true,
          kind: true,
          durationMin: true,
          medium: true,
          status: true,
          startsAt: true,
          endsAt: true,
          createdAt: true,
          pricePiasters: true,
          feePiasters: true,
          totalPiasters: true,
          commissionBps: true,
          studentNote: true,
          cancelledAt: true,
          cancelReason: true,
          refundShareBps: true,
          completedAt: true,
          cancelledBy: { select: { fullName: true, role: true } },
          student: { select: { user: { select: { id: true, fullName: true, phone: true } } } },
          mentor: {
            select: { slug: true, user: { select: { id: true, fullName: true, phone: true } } },
          },
          meeting: { select: { provider: true, studentJoinedAt: true, mentorJoinedAt: true } },
          payments: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              method: true,
              status: true,
              amountPiasters: true,
              failureReason: true,
              providerTxnId: true,
              createdAt: true,
              refunds: { select: { amountPiasters: true, status: true, createdAt: true } },
            },
          },
          review: { select: { id: true, rating: true, text: true, status: true } },
          ledger: {
            orderBy: { createdAt: 'asc' },
            select: { type: true, amountPiasters: true, createdAt: true },
          },
        },
      });
      if (!b) throw Errors.notFound(MESSAGES.bookingNotFound);
      const egp = (p: number) => p / 100;
      return {
        id: b.id,
        label: SESSION_TYPES[b.kind as SessionKind].label,
        durationMin: b.durationMin,
        medium: b.medium,
        status: b.status,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        createdAt: b.createdAt.toISOString(),
        priceEgp: egp(b.pricePiasters),
        feeEgp: egp(b.feePiasters),
        totalEgp: egp(b.totalPiasters),
        commissionBps: b.commissionBps,
        note: b.studentNote,
        cancelledAt: b.cancelledAt?.toISOString() ?? null,
        cancelReason: b.cancelReason,
        cancelledBy: b.cancelledBy
          ? { name: b.cancelledBy.fullName, role: b.cancelledBy.role }
          : null,
        refundShareBps: b.refundShareBps,
        completedAt: b.completedAt?.toISOString() ?? null,
        student: {
          id: b.student.user.id,
          name: b.student.user.fullName,
          phone: formatEgyptianMobile(b.student.user.phone),
        },
        mentor: {
          id: b.mentor.user.id,
          slug: b.mentor.slug,
          name: b.mentor.user.fullName,
          phone: formatEgyptianMobile(b.mentor.user.phone),
        },
        meeting: b.meeting
          ? {
              provider: b.meeting.provider,
              studentJoinedAt: b.meeting.studentJoinedAt?.toISOString() ?? null,
              mentorJoinedAt: b.meeting.mentorJoinedAt?.toISOString() ?? null,
            }
          : null,
        payments: b.payments.map((p) => ({
          id: p.id,
          method: p.method,
          status: p.status,
          amountEgp: egp(p.amountPiasters),
          failureReason: p.failureReason,
          providerTxnId: p.providerTxnId,
          createdAt: p.createdAt.toISOString(),
          refunds: p.refunds.map((r) => ({
            amountEgp: egp(r.amountPiasters),
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          })),
        })),
        review: b.review,
        ledger: b.ledger.map((l) => ({
          type: l.type,
          amountEgp: egp(l.amountPiasters),
          createdAt: l.createdAt.toISOString(),
        })),
      };
    },

    async refundBooking(actor: AdminActor, id: string, reason: string) {
      const { before } = await bookings.adminRefund(actor.auth.userId, id, reason);
      await writeAudit(
        db,
        actor,
        'booking.admin_refund',
        { type: 'booking', id },
        {
          before: { status: before },
          after: { status: 'cancelled', refundShareBps: 10_000, note: reason },
        },
      );
      deps.onMentorsChanged?.();
      return this.getBooking(id);
    },

    // ---------- reviews ----------

    async listReviews(q: { status?: ReviewStatus | undefined; page: number }) {
      const where: Prisma.ReviewWhereInput = q.status ? { status: q.status } : {};
      const [total, rows] = await Promise.all([
        db.review.count({ where }),
        db.review.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            rating: true,
            text: true,
            status: true,
            createdAt: true,
            bookingId: true,
            student: { select: { user: { select: { fullName: true } } } },
            mentor: { select: { slug: true, user: { select: { fullName: true } } } },
          },
        }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          rating: r.rating,
          text: r.text,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          bookingId: r.bookingId,
          student: r.student.user.fullName ?? 'طالب',
          mentor: r.mentor.user.fullName ?? 'مرشد',
          mentorSlug: r.mentor.slug,
        })),
        page: { page: q.page, pageSize: PAGE_SIZE, total },
      };
    },

    async setReviewStatus(
      actor: AdminActor,
      id: string,
      status: 'published' | 'hidden',
      note: string,
    ) {
      const r = await db.review.findUnique({
        where: { id },
        select: { status: true, mentorId: true },
      });
      if (!r) throw Errors.notFound(MESSAGES.reviewNotFound);
      if (r.status !== status)
        await db.$transaction(async (tx) => {
          await tx.review.update({
            where: { id },
            data: { status, moderatedById: actor.auth.userId },
          });
          await recomputeRating(tx, r.mentorId);
          await writeAudit(
            tx,
            actor,
            `review.${status === 'hidden' ? 'hide' : 'restore'}`,
            { type: 'review', id },
            {
              before: { status: r.status },
              after: { status, note },
            },
          );
        });
      deps.onMentorsChanged?.();
      return { id, status };
    },

    // ---------- accounts ----------

    async listUsers(q: {
      q?: string | undefined;
      role?: UserRole | undefined;
      status?: AccountStatus | undefined;
      page: number;
    }) {
      const phone = q.q ? normalizeEgyptianMobile(q.q) : null;
      const where: Prisma.UserWhereInput = {
        role: q.role ? q.role : { in: ['student', 'mentor'] },
        ...(q.status ? { status: q.status } : { status: { not: 'deleted' } }),
        ...(q.q
          ? phone
            ? { phone }
            : {
                OR: [
                  { fullName: { contains: q.q, mode: 'insensitive' as const } },
                  { email: { contains: q.q.toLowerCase() } },
                ],
              }
          : {}),
      };
      const [total, rows] = await Promise.all([
        db.user.count({ where }),
        db.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            fullName: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
            emailVerifiedAt: true,
            mentor: { select: { slug: true, isListed: true } },
            _count: { select: { authSessions: true } },
          },
        }),
      ]);
      const ids = rows.map((u) => u.id);
      const [asStudent, asMentor] = await Promise.all([
        db.booking.groupBy({
          by: ['studentId'],
          where: { studentId: { in: ids }, NOT: { status: 'pending' } },
          _count: { _all: true },
        }),
        db.booking.groupBy({
          by: ['mentorId'],
          where: { mentorId: { in: ids }, NOT: { status: 'pending' } },
          _count: { _all: true },
        }),
      ]);
      const count = new Map<string, number>();
      for (const g of asStudent) count.set(g.studentId, g._count._all);
      for (const g of asMentor) count.set(g.mentorId, (count.get(g.mentorId) ?? 0) + g._count._all);
      return {
        items: rows.map((u) => ({
          id: u.id,
          name: u.fullName,
          phone: formatEgyptianMobile(u.phone),
          role: u.role,
          status: u.status,
          createdAt: u.createdAt.toISOString(),
          emailConfirmed: u.emailVerifiedAt !== null,
          mentor: u.mentor ? { slug: u.mentor.slug, listed: u.mentor.isListed } : null,
          bookings: count.get(u.id) ?? 0,
        })),
        page: { page: q.page, pageSize: PAGE_SIZE, total },
      };
    },

    async setUserStatus(
      actor: AdminActor,
      id: string,
      status: 'active' | 'suspended',
      note: string,
    ) {
      const u = await db.user.findUnique({ where: { id }, select: { role: true, status: true } });
      if (!u || u.status === 'deleted') throw Errors.notFound(MESSAGES.userNotFound);
      if (u.role === 'admin') throw new AppError('FORBIDDEN', MESSAGES.notAdmins);
      if (u.status === status) throw new AppError('CONFLICT', MESSAGES.same);
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { status } });
        await writeAudit(
          tx,
          actor,
          status === 'suspended' ? 'user.suspend' : 'user.reactivate',
          { type: 'user', id },
          {
            before: { status: u.status },
            after: { status, note },
          },
        );
      });
      // Signed out everywhere at once (sessions also check the status on every request).
      if (status === 'suspended') await sessions.revokeAll(id);
      deps.onMentorsChanged?.();
      return { id, status };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
