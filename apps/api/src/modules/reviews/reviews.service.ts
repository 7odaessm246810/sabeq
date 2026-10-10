/**
 * Reviews (Phase 18): only the student of a completed session, once per session (the unique
 * `reviews.booking_id`), within REVIEW_WINDOW_DAYS of its end. A mentor's rating is the average of
 * their published reviews, recomputed in the same transaction — never typed in, never invented.
 */
import { REVIEW_WINDOW_DAYS, SESSION_TYPES, type SessionKind } from '@sabeq/types';
import { AppError, Errors } from '../../core/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../infra/db.js';

const MESSAGES = {
  notFound: 'الجلسة دي مش موجودة.',
  notCompleted: 'تقدر تقيّم الجلسة بعد ما تخلص.',
  already: 'قيّمت الجلسة دي قبل كده.',
  tooLate: `التقييم متاح لحد ${REVIEW_WINDOW_DAYS} يوم بعد الجلسة.`,
  mentorNotFound: 'المرشد ده مش موجود.',
};

const PAGE_SIZE = 10;

const isUnique = (err: unknown) => (err as { code?: string })?.code === 'P2002';

/** Average and count of a mentor's published reviews, written onto the mentor. */
export async function recomputeRating(tx: Prisma.TransactionClient, mentorId: string) {
  const agg = await tx.review.aggregate({
    where: { mentorId, status: 'published' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.mentor.update({
    where: { userId: mentorId },
    data: {
      ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      ratingCount: agg._count._all,
    },
  });
}

export function createReviewsService(deps: {
  db: Db;
  /** Mentor cards and search carry the rating: refresh them. */
  onRatingChanged?: () => void;
  now?: () => Date;
}) {
  const { db, now = () => new Date() } = deps;

  return {
    async create(studentId: string, bookingId: string, input: { rating: number; text?: string }) {
      const b = await db.booking.findUnique({
        where: { id: bookingId },
        select: {
          studentId: true,
          mentorId: true,
          kind: true,
          status: true,
          endsAt: true,
          completedAt: true,
          review: { select: { id: true } },
          student: { select: { user: { select: { fullName: true } } } },
        },
      });
      if (!b || b.studentId !== studentId) throw Errors.notFound(MESSAGES.notFound);
      if (b.status !== 'completed') throw new AppError('CONFLICT', MESSAGES.notCompleted);
      if (b.review) throw new AppError('CONFLICT', MESSAGES.already);
      const ended = b.completedAt && b.completedAt > b.endsAt ? b.completedAt : b.endsAt;
      if (now().getTime() - ended.getTime() > REVIEW_WINDOW_DAYS * 86_400_000)
        throw new AppError('CONFLICT', MESSAGES.tooLate);

      const text = input.text?.trim() || null;
      try {
        const review = await db.$transaction(async (tx) => {
          const created = await tx.review.create({
            data: {
              bookingId,
              studentId,
              mentorId: b.mentorId,
              rating: input.rating,
              text,
              topic: SESSION_TYPES[b.kind as SessionKind].label,
            },
            select: { id: true, rating: true, text: true, createdAt: true },
          });
          await recomputeRating(tx, b.mentorId);
          await tx.notification.create({
            data: {
              userId: b.mentorId,
              type: 'review.created',
              title: 'تقييم جديد',
              body: `${b.student.user.fullName?.split(' ')[0] ?? 'طالب'} قيّم جلسته معاك ${input.rating} من 5.`,
              data: { bookingId, reviewId: created.id },
            },
          });
          return created;
        });
        deps.onRatingChanged?.();
        return {
          id: review.id,
          rating: review.rating,
          text: review.text,
          date: review.createdAt.toISOString().slice(0, 10),
        };
      } catch (err) {
        // Two submissions at once: the unique booking_id lets one through.
        if (isUnique(err)) throw new AppError('CONFLICT', MESSAGES.already);
        throw err;
      }
    },

    /** A listed mentor's published reviews, newest first. */
    async forMentor(slug: string, page: number) {
      const m = await db.mentor.findFirst({
        where: { slug, isListed: true, user: { status: 'active', deletedAt: null } },
        select: { userId: true, ratingAvg: true, ratingCount: true },
      });
      if (!m) throw Errors.notFound(MESSAGES.mentorNotFound);
      const rows = await db.review.findMany({
        where: { mentorId: m.userId, status: 'published' },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          rating: true,
          text: true,
          topic: true,
          createdAt: true,
          student: { select: { user: { select: { fullName: true } } } },
        },
      });
      return {
        rating: m.ratingCount ? Number(m.ratingAvg) : null,
        ratingCount: m.ratingCount,
        reviews: rows.slice(0, PAGE_SIZE).map((r) => ({
          id: r.id,
          rating: r.rating,
          text: r.text,
          topic: r.topic,
          date: r.createdAt.toISOString().slice(0, 10),
          // First name only: reviewers are students.
          name: r.student.user.fullName?.split(' ')[0] ?? 'طالب',
        })),
        hasMore: rows.length > PAGE_SIZE,
      };
    },
  };
}

export type ReviewsService = ReturnType<typeof createReviewsService>;
