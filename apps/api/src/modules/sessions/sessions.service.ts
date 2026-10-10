/**
 * Sessions (Phase 17): the video room of a confirmed booking.
 *
 * - join: the student or the mentor, from JOIN_OPENS_MINUTES_BEFORE the start until
 *   JOIN_CLOSES_MINUTES_AFTER the end. The room is created on the first join (one per booking) and
 *   each person gets their own address, valid only until the room closes. The first join of each
 *   side is recorded — that is the attendance the rules below rely on.
 * - sweep (every minute): a mentor who hasn't come NO_SHOW_GRACE_MINUTES after the start — by
 *   Sabeq's record or the room's own log — loses the session, and the student is refunded in full
 *   (decision 2026-10-10).
 */
import {
  JOIN_CLOSES_MINUTES_AFTER,
  JOIN_OPENS_MINUTES_BEFORE,
  NO_SHOW_GRACE_MINUTES,
} from '@sabeq/types';
import type { Logger } from 'pino';
import { AppError, Errors } from '../../core/errors.js';
import type { Db } from '../../infra/db.js';
import type { BookingsService } from '../bookings/bookings.service.js';
import type { VideoProvider } from './video.js';

const MESSAGES = {
  notFound: 'الجلسة دي مش موجودة.',
  notConfirmed: 'الجلسة دي مش مؤكدة.',
  over: 'الجلسة دي خلصت.',
  tooEarly: `الجلسة بتفتح قبل معادها بـ${JOIN_OPENS_MINUTES_BEFORE} دقايق.`,
  provider: 'ما قدرناش نفتح الجلسة دلوقتي. جرّب تاني بعد لحظات.',
};

const MINUTE = 60_000;

export function createSessionsService(deps: {
  db: Db;
  video: VideoProvider;
  bookings: Pick<BookingsService, 'mentorNoShow'>;
  logger: Logger;
  now?: () => Date;
}) {
  const { db, video, bookings, logger, now = () => new Date() } = deps;

  async function ensureRoom(b: {
    id: string;
    startsAt: Date;
    opensAt: Date;
    closesAt: Date;
    audioOnly: boolean;
  }) {
    const existing = await db.meeting.findUnique({ where: { bookingId: b.id } });
    if (existing) return existing;
    const room = await video.createRoom({
      bookingId: b.id,
      opensAt: b.opensAt,
      closesAt: b.closesAt,
      audioOnly: b.audioOnly,
    });
    // Both sides may open it at the same moment: whoever saves first wins, the other reads it.
    return db.meeting.upsert({
      where: { bookingId: b.id },
      create: {
        bookingId: b.id,
        provider: video.name,
        roomId: room.roomId,
        roomUrl: room.roomUrl,
        startsAt: b.startsAt,
      },
      update: {},
    });
  }

  return {
    provider: video.name,

    async join(userId: string, bookingId: string) {
      const b = await db.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          studentId: true,
          mentorId: true,
          status: true,
          medium: true,
          startsAt: true,
          endsAt: true,
          student: { select: { user: { select: { fullName: true } } } },
          mentor: { select: { user: { select: { fullName: true } } } },
        },
      });
      const isMentor = b?.mentorId === userId;
      if (!b || (!isMentor && b.studentId !== userId)) throw Errors.notFound(MESSAGES.notFound);
      if (b.status === 'completed' || b.status === 'no_show')
        throw new AppError('CONFLICT', MESSAGES.over);
      if (b.status !== 'confirmed') throw new AppError('CONFLICT', MESSAGES.notConfirmed);

      const opensAt = new Date(b.startsAt.getTime() - JOIN_OPENS_MINUTES_BEFORE * MINUTE);
      const closesAt = new Date(b.endsAt.getTime() + JOIN_CLOSES_MINUTES_AFTER * MINUTE);
      if (now() < opensAt) throw new AppError('CONFLICT', MESSAGES.tooEarly);
      if (now() > closesAt) throw new AppError('CONFLICT', MESSAGES.over);

      const audioOnly = b.medium === 'audio';
      let url: string | null;
      try {
        const meeting = await ensureRoom({ ...b, opensAt, closesAt, audioOnly });
        await db.meeting.updateMany({
          where: {
            bookingId: b.id,
            ...(isMentor ? { mentorJoinedAt: null } : { studentJoinedAt: null }),
          },
          data: isMentor ? { mentorJoinedAt: now() } : { studentJoinedAt: now() },
        });
        url = await video.joinUrl({
          roomId: meeting.roomId,
          roomUrl: meeting.roomUrl,
          userId,
          name: (isMentor ? b.mentor.user.fullName : b.student.user.fullName) ?? 'سابق',
          isMentor,
          expiresAt: closesAt,
          audioOnly,
        });
      } catch (err) {
        logger.error({ err, bookingId }, 'video room failed');
        throw new AppError('INTERNAL', MESSAGES.provider);
      }
      return { provider: video.name, url, closesAt: closesAt.toISOString() };
    },

    /** Mentors who never came: full refund. Safe to run anywhere, any time. */
    async sweep() {
      const at = now().getTime();
      const due = await db.booking.findMany({
        where: {
          status: 'confirmed',
          startsAt: {
            lt: new Date(at - NO_SHOW_GRACE_MINUTES * MINUTE),
            // Older sessions are past this rule (the auto-completion handles them).
            gt: new Date(at - 24 * 60 * MINUTE),
          },
          OR: [{ meeting: null }, { meeting: { mentorJoinedAt: null } }],
        },
        select: { id: true, mentorId: true, studentId: true, meeting: true },
        take: 50,
      });
      let refunded = 0;
      for (const b of due) {
        if (b.meeting) {
          // The room's own log may know better (e.g. our record was lost): trust what it saw.
          let seen: Map<string, Date> | null;
          try {
            seen = await video.attendance(b.meeting.roomId);
          } catch (err) {
            logger.warn({ err, bookingId: b.id }, 'attendance check failed — will retry');
            continue;
          }
          const mentorAt = seen?.get(b.mentorId);
          if (mentorAt) {
            const studentAt = seen?.get(b.studentId);
            await db.meeting.update({
              where: { bookingId: b.id },
              data: {
                mentorJoinedAt: mentorAt,
                ...(studentAt && !b.meeting.studentJoinedAt ? { studentJoinedAt: studentAt } : {}),
              },
            });
            continue;
          }
        }
        if (await bookings.mentorNoShow(b.id)) refunded++;
      }
      return { mentorNoShows: refunded };
    },
  };
}

export type SessionsService = ReturnType<typeof createSessionsService>;
