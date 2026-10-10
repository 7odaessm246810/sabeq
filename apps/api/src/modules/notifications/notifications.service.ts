/**
 * Notifications (Phase 19).
 *
 * - In the app: every module writes `notifications` rows; this lists them, counts the unread and
 *   marks them read.
 * - By email: only to an address its owner confirmed (a signed link, valid a day). The sweeper turns
 *   each new notification into one `notification_deliveries` row per channel (unique) and sends it;
 *   a delivery is claimed before sending so two API instances never send it twice, and failures are
 *   retried up to MAX_ATTEMPTS.
 * - Reminders: REMINDER_MINUTES_BEFORE a confirmed session, once (`bookings.reminder_sent_at`).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  JOIN_OPENS_MINUTES_BEFORE,
  REMINDER_MINUTES_BEFORE,
  SESSION_TYPES,
  notificationLink,
  type SessionKind,
} from '@sabeq/types';
import { formatCairoTime } from '@sabeq/utils';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { AppError, Errors } from '../../core/errors.js';
import type { Db } from '../../infra/db.js';
import { renderEmail, type EmailSender } from './email.js';

const MESSAGES = {
  emailTaken: 'الإيميل ده مستخدم في حساب تاني.',
  tooSoon: 'استنى دقيقة قبل ما نبعت رابط تاني.',
  tooMany: 'بعتنا روابط كتير النهارده. جرّب بكرة.',
  badLink: 'الرابط ده مش صحيح أو قديم. ابعت رابط جديد من «حسابي».',
  noEmail: 'مفيش إيميل في حسابك.',
};

const MAX_ATTEMPTS = 5;
const LINK_HOURS = 24;
const MIN = 60_000;
const FOOTER =
  'وصلك الإيميل ده عشان ضفت إيميلك في حسابك على سابق. تقدر توقف الإيميلات بإنك تشيل الإيميل من «حسابي».';

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function createNotificationsService(deps: {
  db: Db;
  redis: Redis;
  email: EmailSender;
  publicWebUrl: string;
  /** Signs email-confirmation links. */
  secret: string;
  logger: Logger;
  now?: () => Date;
}) {
  const { db, redis, email, publicWebUrl, secret, logger, now = () => new Date() } = deps;

  const sign = (payload: string) =>
    createHmac('sha256', secret).update(`email-verify:${payload}`).digest('base64url');

  function verifyLink(userId: string, address: string) {
    const payload = b64(
      JSON.stringify({ u: userId, e: address, x: now().getTime() + LINK_HOURS * 60 * MIN }),
    );
    return `${publicWebUrl}/verify-email?token=${payload}.${sign(payload)}`;
  }

  async function sendVerification(userId: string, address: string) {
    const cooldown = await redis.set(`email:verify:cooldown:${userId}`, '1', 'EX', 60, 'NX');
    if (!cooldown) throw new AppError('RATE_LIMITED', MESSAGES.tooSoon);
    const day = `email:verify:day:${userId}`;
    const count = await redis.incr(day);
    if (count === 1) await redis.expire(day, 86_400);
    if (count > 5) throw new AppError('RATE_LIMITED', MESSAGES.tooMany);
    const link = verifyLink(userId, address);
    const { text, html } = renderEmail({
      title: 'أكّد إيميلك',
      body: 'دوس على الزرار عشان نبدأ نبعتلك إشعارات جلساتك على الإيميل ده. الرابط شغال 24 ساعة.',
      action: { label: 'أكّد الإيميل', url: link },
      footer: 'لو مش انت اللي ضفت الإيميل ده على سابق، تجاهل الرسالة دي.',
    });
    await email.send({ to: address, subject: 'أكّد إيميلك على سابق', text, html });
    // Local development: no email leaves the machine, so the page shows the link (never in production).
    return email.name === 'console' ? { devLink: link } : {};
  }

  /** Each new notification → one email delivery, for people with a confirmed address. */
  async function queueEmails() {
    const pending = await db.notification.findMany({
      where: {
        createdAt: { gt: new Date(now().getTime() - 2 * 24 * 60 * MIN) },
        deliveries: { none: { channel: 'email' } },
        user: { emailVerifiedAt: { not: null }, status: 'active' },
      },
      select: { id: true, createdAt: true, user: { select: { emailVerifiedAt: true } } },
      take: 100,
    });
    // Only what arrived after the address was confirmed; older ones are recorded as not sent.
    if (pending.length)
      await db.notificationDelivery.createMany({
        data: pending.map((n) => {
          const after = n.user.emailVerifiedAt !== null && n.createdAt >= n.user.emailVerifiedAt;
          return {
            notificationId: n.id,
            channel: 'email' as const,
            ...(after
              ? {}
              : { status: 'failed' as const, lastError: 'before the email was confirmed' }),
          };
        }),
        skipDuplicates: true,
      });
  }

  async function sendQueued() {
    const due = await db.notificationDelivery.findMany({
      where: { channel: 'email', status: 'queued', attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: {
        id: true,
        attempts: true,
        notification: {
          select: {
            type: true,
            title: true,
            body: true,
            data: true,
            user: { select: { email: true, emailVerifiedAt: true } },
          },
        },
      },
    });
    let sent = 0;
    for (const d of due) {
      // Claim it: only the instance that moves `attempts` on sends it.
      const claimed = await db.notificationDelivery.updateMany({
        where: { id: d.id, status: 'queued', attempts: d.attempts },
        data: { attempts: d.attempts + 1 },
      });
      if (!claimed.count) continue;
      const n = d.notification;
      if (!n.user.email || !n.user.emailVerifiedAt) {
        await db.notificationDelivery.update({
          where: { id: d.id },
          data: { status: 'failed', lastError: 'no confirmed email' },
        });
        continue;
      }
      try {
        const { text, html } = renderEmail({
          title: n.title,
          body: n.body,
          action: { label: 'افتح سابق', url: `${publicWebUrl}${notificationLink(n.type, n.data)}` },
          footer: FOOTER,
        });
        const res = await email.send({ to: n.user.email, subject: n.title, text, html });
        await db.notificationDelivery.update({
          where: { id: d.id },
          data: { status: 'sent', sentAt: now(), providerMessageId: res.id.slice(0, 120) || null },
        });
        sent++;
      } catch (err) {
        logger.warn({ err, deliveryId: d.id }, 'email delivery failed');
        await db.notificationDelivery.update({
          where: { id: d.id },
          data: {
            status: d.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued',
            lastError: String((err as Error).message ?? err).slice(0, 500),
          },
        });
      }
    }
    return sent;
  }

  async function remind() {
    const soon = await db.booking.findMany({
      where: {
        status: 'confirmed',
        reminderSentAt: null,
        startsAt: { gt: now(), lte: new Date(now().getTime() + REMINDER_MINUTES_BEFORE * MIN) },
      },
      select: {
        id: true,
        kind: true,
        startsAt: true,
        studentId: true,
        mentorId: true,
        student: { select: { user: { select: { fullName: true } } } },
        mentor: { select: { user: { select: { fullName: true } } } },
      },
      take: 100,
    });
    let reminded = 0;
    for (const b of soon) {
      const claimed = await db.booking.updateMany({
        where: { id: b.id, reminderSentAt: null },
        data: { reminderSentAt: now() },
      });
      if (!claimed.count) continue;
      const at = formatCairoTime(b.startsAt);
      const label = SESSION_TYPES[b.kind as SessionKind].label;
      const body = (other: string) =>
        `${label} مع ${other} الساعة ${at}. الجلسة بتفتح قبلها بـ${JOIN_OPENS_MINUTES_BEFORE} دقايق من «جلساتي».`;
      await db.notification.createMany({
        data: [
          {
            userId: b.studentId,
            type: 'session.reminder',
            title: 'جلستك بعد شوية',
            body: body(b.mentor.user.fullName ?? 'المرشد'),
            data: { bookingId: b.id },
          },
          {
            userId: b.mentorId,
            type: 'session.reminder',
            title: 'جلستك بعد شوية',
            body: body(b.student.user.fullName ?? 'الطالب'),
            data: { bookingId: b.id },
          },
        ],
      });
      reminded++;
    }
    return reminded;
  }

  return {
    async list(userId: string, opts: { before?: string | undefined; limit: number }) {
      const cursor = opts.before
        ? await db.notification.findFirst({
            where: { id: opts.before, userId },
            select: { createdAt: true, id: true },
          })
        : null;
      const rows = await db.notification.findMany({
        where: {
          userId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: opts.limit + 1,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          readAt: true,
          createdAt: true,
        },
      });
      const page = rows.slice(0, opts.limit);
      return {
        items: page.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          link: notificationLink(n.type, n.data),
          read: n.readAt !== null,
          createdAt: n.createdAt.toISOString(),
        })),
        unread: await db.notification.count({ where: { userId, readAt: null } }),
        nextBefore: rows.length > opts.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },

    unreadCount: (userId: string) => db.notification.count({ where: { userId, readAt: null } }),

    /** Marks these (or, without ids, all) as read. */
    async markRead(userId: string, ids?: string[]) {
      const res = await db.notification.updateMany({
        where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
        data: { readAt: now() },
      });
      return res.count;
    },

    async getEmail(userId: string) {
      const u = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true },
      });
      return { email: u.email, verified: u.emailVerifiedAt !== null };
    },

    /** Saves the address (unconfirmed) and sends the confirmation link. */
    async setEmail(userId: string, raw: string) {
      const address = raw.trim().toLowerCase();
      const current = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true },
      });
      if (current.email === address && current.emailVerifiedAt)
        return { email: address, verified: true };
      const taken = await db.user.findFirst({
        where: { email: address, id: { not: userId } },
        select: { id: true },
      });
      if (taken) throw Errors.validation({ email: MESSAGES.emailTaken }, MESSAGES.emailTaken);
      const sent = await sendVerification(userId, address);
      try {
        await db.user.update({
          where: { id: userId },
          data: { email: address, emailVerifiedAt: null },
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002')
          throw Errors.validation({ email: MESSAGES.emailTaken }, MESSAGES.emailTaken);
        throw err;
      }
      return { email: address, verified: false, ...sent };
    },

    async resendVerification(userId: string) {
      const u = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true },
      });
      if (!u.email) throw new AppError('CONFLICT', MESSAGES.noEmail);
      const sent = u.emailVerifiedAt ? {} : await sendVerification(userId, u.email);
      return { email: u.email, verified: u.emailVerifiedAt !== null, ...sent };
    },

    async removeEmail(userId: string) {
      await db.user.update({ where: { id: userId }, data: { email: null, emailVerifiedAt: null } });
      return { email: null, verified: false };
    },

    /** The link from the confirmation email (works signed out, on any device). */
    async verifyEmail(token: string) {
      const [payload = '', sig = ''] = token.split('.');
      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !timingSafeEqual(expected, given))
        throw new AppError('CONFLICT', MESSAGES.badLink);
      let claim: { u?: unknown; e?: unknown; x?: unknown };
      try {
        claim = JSON.parse(Buffer.from(payload, 'base64url').toString()) as typeof claim;
      } catch {
        throw new AppError('CONFLICT', MESSAGES.badLink);
      }
      if (typeof claim.u !== 'string' || typeof claim.e !== 'string' || typeof claim.x !== 'number')
        throw new AppError('CONFLICT', MESSAGES.badLink);
      if (claim.x < now().getTime()) throw new AppError('CONFLICT', MESSAGES.badLink);
      // Only the address the link was sent for, and only while it's still the account's address.
      const done = await db.user.updateMany({
        where: { id: claim.u, email: claim.e },
        data: { emailVerifiedAt: now() },
      });
      if (!done.count) throw new AppError('CONFLICT', MESSAGES.badLink);
      return { email: claim.e, verified: true };
    },

    /** Reminders, then emails. Safe to run anywhere, any time. */
    async sweep() {
      const reminded = await remind();
      await queueEmails();
      const emailed = await sendQueued();
      return { reminded, emailed };
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
