/**
 * Payments (Phase 16). The browser never confirms anything: a booking becomes `confirmed` only
 * when the gateway's HMAC-signed transaction callback says the money arrived, for the right amount.
 *
 * - start: the student picks a method; we record a `pending` payment and send them to the gateway's
 *   hosted checkout (card numbers never touch Sabeq). Kiosk (Aman / Masary) payments take longer,
 *   so they hold the slot up to 24 h and are only offered for sessions far enough ahead.
 * - callback: verified, recorded once (`payment_events.provider_event_id` is unique — Paymob may
 *   retry), then: success → payment succeeded + booking confirmed; failure → payment failed.
 *   Money for a slot that was lost meanwhile is refunded automatically.
 * - refunds: started by a cancellation; recorded `pending` first, then sent. A gateway hiccup leaves
 *   them pending and the sweeper retries.
 */
import { BOOKING_HOLD_MINUTES } from '@sabeq/types';
import type { Logger } from 'pino';
import { AppError, Errors } from '../../core/errors.js';
import type { Db } from '../../infra/db.js';
import type { BookingsService } from '../bookings/bookings.service.js';
import type { PayMethod, PaymentGateway } from './gateway.js';
import { verifyPaymobHmac, type PaymobTransaction } from './hmac.js';

const MESSAGES = {
  method: 'طريقة الدفع دي مش متاحة دلوقتي.',
  kioskTooLate: 'الدفع في المنافذ محتاج الجلسة تكون بعد يومين على الأقل. اختار كارت أو محفظة.',
  gateway: 'ما قدرناش نفتح صفحة الدفع دلوقتي. مفيش أي فلوس اتخصمت — جرّب تاني بعد شوية.',
};

/** Kiosk payments: the code is valid this long, and the session must be at least this far. */
const KIOSK_HOLD_HOURS = 24;
const KIOSK_MIN_LEAD_HOURS = 48;
const HOUR = 3_600_000;

export function createPaymentsService(deps: {
  db: Db;
  gateway: PaymentGateway;
  bookings: Pick<BookingsService, 'confirmPaid' | 'holdFor'>;
  publicWebUrl: string;
  logger: Logger;
  /** ADR-0017: off while no confirmation email can be sent. */
  requireConfirmedEmail?: boolean;
  now?: () => Date;
}) {
  const { db, gateway, bookings, publicWebUrl, logger, now = () => new Date() } = deps;
  const requireConfirmedEmail = deps.requireConfirmedEmail ?? true;

  async function runRefund(refundId: string) {
    const r = await db.refund.findUniqueOrThrow({
      where: { id: refundId },
      select: {
        id: true,
        status: true,
        amountPiasters: true,
        payment: {
          select: { id: true, providerTxnId: true, amountPiasters: true, bookingId: true },
        },
      },
    });
    if (r.status !== 'pending' || !r.payment.providerTxnId) return;
    // Claim it: of two API instances (or the sweeper racing a cancel) only one sends it.
    const claimed = await db.refund.updateMany({
      where: { id: r.id, status: 'pending' },
      data: { status: 'sending' },
    });
    if (claimed.count !== 1) return;
    try {
      const { providerRefundId } = await gateway.refund({
        providerTxnId: r.payment.providerTxnId,
        amountPiasters: r.amountPiasters,
      });
      await db.$transaction([
        db.refund.update({ where: { id: r.id }, data: { status: 'succeeded', providerRefundId } }),
        db.payment.update({
          where: { id: r.payment.id },
          data: {
            status:
              r.amountPiasters >= r.payment.amountPiasters ? 'refunded' : 'partially_refunded',
          },
        }),
        db.booking.updateMany({
          where: { id: r.payment.bookingId, status: 'cancelled' },
          data: { status: 'refunded' },
        }),
      ]);
    } catch (err) {
      // The gateway refused or was unreachable: release the claim so the sweeper retries it.
      await db.refund.updateMany({
        where: { id: r.id, status: 'sending' },
        data: { status: 'pending' },
      });
      logger.error({ err, refundId: r.id }, 'refund failed — will retry');
    }
  }

  /** Records and sends a refund of `amountPiasters` for a succeeded payment. Idempotent per payment. */
  async function refundPayment(paymentId: string, amountPiasters: number, reason: string) {
    if (amountPiasters <= 0) return;
    // One refund per payment (unique in the database): a second caller finds the first one.
    let refund = await db.refund.findUnique({ where: { paymentId }, select: { id: true } });
    if (!refund) {
      try {
        refund = await db.refund.create({
          data: { paymentId, amountPiasters, reason },
          select: { id: true },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        refund = await db.refund.findUniqueOrThrow({ where: { paymentId }, select: { id: true } });
      }
    }
    await runRefund(refund.id);
  }

  return {
    methods: gateway.methods,

    async start(studentId: string, bookingId: string, method: PayMethod) {
      if (!gateway.methods.includes(method))
        throw Errors.validation({ method: MESSAGES.method }, MESSAGES.method);
      const b = await bookings.holdFor(studentId, bookingId);
      const user = await db.user.findUniqueOrThrow({
        where: { id: studentId },
        select: { fullName: true, phone: true, email: true, emailVerifiedAt: true },
      });
      // Holds made before the email rule (or an email changed since) still need a confirmed one.
      if (requireConfirmedEmail && !user.emailVerifiedAt) throw Errors.emailUnverified();
      let holdUntil = b.holdExpiresAt ?? new Date(now().getTime() + BOOKING_HOLD_MINUTES * 60_000);
      if (method === 'kiosk') {
        if (b.startsAt.getTime() - now().getTime() < KIOSK_MIN_LEAD_HOURS * HOUR)
          throw new AppError('CONFLICT', MESSAGES.kioskTooLate);
        holdUntil = new Date(now().getTime() + KIOSK_HOLD_HOURS * HOUR);
        await db.booking.update({ where: { id: b.id }, data: { holdExpiresAt: holdUntil } });
      }

      const [firstName = 'طالب', ...rest] = (user.fullName ?? 'طالب سابق').split(' ');
      const payment = await db.payment.create({
        data: { bookingId: b.id, method, amountPiasters: b.totalPiasters },
      });
      try {
        const checkout = await gateway.createCheckout({
          paymentId: payment.id,
          amountPiasters: b.totalPiasters,
          method,
          itemName: 'جلسة على سابق',
          billing: { firstName, lastName: rest.join(' '), phone: user.phone, email: user.email },
          notificationUrl: `${publicWebUrl}/api/v1/payments/paymob/webhook`,
          redirectionUrl: `${publicWebUrl}/book/${b.mentor.slug}/done?booking=${b.id}`,
          expiresInSeconds: Math.max(
            60,
            Math.round((holdUntil.getTime() - now().getTime()) / 1000),
          ),
        });
        await db.payment.update({
          where: { id: payment.id },
          data: { providerOrderId: checkout.providerOrderId },
        });
        return { redirectUrl: checkout.redirectUrl, paymentId: payment.id };
      } catch (err) {
        logger.error({ err, paymentId: payment.id }, 'checkout failed');
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'failed', failureReason: 'تعذّر فتح صفحة الدفع' },
        });
        throw new AppError('INTERNAL', MESSAGES.gateway);
      }
    },

    /**
     * A transaction callback (Paymob's, or the fake checkout's). Returns what was done; never throws
     * for a bad or duplicate callback — the route answers 200 so the gateway stops retrying.
     */
    async handleTransaction(obj: PaymobTransaction, hmac: string) {
      const valid = verifyPaymobHmac(
        obj as unknown as Record<string, unknown>,
        hmac,
        gateway.hmacSecret,
      );
      const eventId = `txn:${obj.id}:${obj.success}:${obj.pending}:${obj.is_refunded}:${obj.is_voided}`;
      // Nothing is stored for an unsigned callback: forged ones must not take the event ids real
      // callbacks will need (they would then be dropped as duplicates), nor fill the table.
      if (!valid) {
        logger.warn({ eventId }, 'payment callback with a bad HMAC — ignored');
        return 'invalid' as const;
      }
      if (obj.currency && obj.currency !== 'EGP') {
        logger.error({ eventId }, 'payment callback in another currency — ignored');
        return 'invalid' as const;
      }
      // Found by the signed Paymob order id. merchant_order_id is not covered by the HMAC, so it is
      // trusted only from the fake gateway (local development).
      const merchantId = obj.order?.merchant_order_id;
      const payment = await db.payment.findFirst({
        where: {
          OR: [
            { providerOrderId: String(obj.order?.id ?? '') },
            ...(gateway.name === 'fake' && merchantId && /^[0-9a-f-]{36}$/.test(merchantId)
              ? [{ id: merchantId }]
              : []),
          ],
        },
      });
      let event: { id: string };
      try {
        event = await db.paymentEvent.create({
          data: {
            providerEventId: eventId,
            type: 'TRANSACTION',
            payload: obj as unknown as object,
            hmacValid: true,
            paymentId: payment?.id ?? null,
          },
          select: { id: true },
        });
      } catch {
        // Seen before. Finished then → a retry to ignore. Not finished (the process stopped
        // half-way) → finish it now; every step below is safe to run twice.
        const seen = await db.paymentEvent.findUnique({
          where: { providerEventId: eventId },
          select: { id: true, processedAt: true },
        });
        if (!seen || seen.processedAt) return 'duplicate' as const;
        event = seen;
      }
      const done = (processingError?: string) =>
        db.paymentEvent.update({
          where: { id: event.id },
          data: { processedAt: now(), ...(processingError ? { processingError } : {}) },
        });

      if (!payment) {
        await done('unknown payment');
        return 'unknown' as const;
      }
      // Refund / void notifications are recorded; refunds are tracked from our own requests.
      if (obj.is_refunded || obj.is_voided || obj.has_parent_transaction) {
        await done();
        return 'ignored' as const;
      }
      if (obj.amount_cents !== payment.amountPiasters) {
        logger.error({ eventId, paymentId: payment.id }, 'amount mismatch — not confirming');
        await done('amount mismatch');
        return 'invalid' as const;
      }

      if (obj.success && !obj.pending) {
        if (payment.status !== 'succeeded') {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: 'succeeded', providerTxnId: String(obj.id), succeededAt: now() },
          });
          const result = await bookings.confirmPaid(payment.bookingId);
          if (result === 'slot_taken' || result === 'cancelled')
            // The money came too late for this slot: give it all back.
            await refundPayment(payment.id, payment.amountPiasters, 'الدفع وصل بعد ما الموعد اتفك');
        }
        await done();
        return 'succeeded' as const;
      }
      if (obj.pending) {
        const ref = obj.data?.bill_reference;
        await db.payment.update({
          where: { id: payment.id },
          data: { kioskReference: ref === null || ref === undefined ? null : String(ref) },
        });
        await done();
        return 'pending' as const;
      }
      if (payment.status === 'pending')
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: 'failed',
            failureReason: (obj.data?.message ?? 'العملية اترفضت').slice(0, 300),
          },
        });
      await done();
      return 'failed' as const;
    },

    /** A paid booking was cancelled: refund its share (cancellation rules, Phase 15). */
    async refundBooking(bookingId: string) {
      const b = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: {
          refundShareBps: true,
          pricePiasters: true,
          totalPiasters: true,
          payments: { where: { status: 'succeeded' }, select: { id: true }, take: 1 },
        },
      });
      const paid = b.payments[0];
      if (!paid || !b.refundShareBps) return;
      const amount =
        b.refundShareBps === 10_000
          ? b.totalPiasters
          : Math.floor((b.pricePiasters * b.refundShareBps) / 10_000);
      await refundPayment(paid.id, amount, 'إلغاء الجلسة');
    },

    /** Retries refunds a gateway hiccup left pending. */
    async sweep() {
      const due = await db.refund.findMany({
        where: { status: 'pending', createdAt: { lt: new Date(now().getTime() - 2 * 60_000) } },
        select: { id: true },
        take: 20,
      });
      for (const r of due) await runRefund(r.id);
      // A refund left 'sending' means the process stopped while talking to the gateway: it may or
      // may not have gone out, so a person checks it in the Paymob dashboard (never re-sent blindly).
      const stuck = await db.refund.count({
        where: { status: 'sending', updatedAt: { lt: new Date(now().getTime() - 15 * 60_000) } },
      });
      if (stuck) logger.error({ stuck }, 'refunds stuck while sending — check them in Paymob');
      return { retried: due.length };
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
