/**
 *   POST /api/v1/bookings/:id/pay          { method: card|wallet|kiosk }  student → { redirectUrl }
 *   GET  /api/v1/payments/methods                                          → { methods }
 *   POST /api/v1/payments/paymob/webhook?hmac=…   Paymob transaction callback (always 200)
 *
 * Fake gateway only (local / tests — never production):
 *   GET  /api/v1/payments/fake/checkout/:paymentId              the test checkout page
 *   POST /api/v1/payments/fake/checkout/:paymentId/:outcome      success | fail | kiosk
 */
import { Router, type RequestHandler } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { requireRole } from '../auth/index.js';
import type { BookingsService } from '../bookings/bookings.service.js';
import { createFakeGateway, createPaymobGateway, type PaymentGateway } from './gateway.js';
import { paymobHmac, type PaymobTransaction } from './hmac.js';
import { createPaymentsService } from './payments.service.js';

const idParam = z.object({ id: z.uuid() });
const payBody = z.object({ method: z.enum(['card', 'wallet', 'kiosk']) }).strict();
const fakeParams = z.object({
  paymentId: z.uuid(),
  outcome: z.enum(['success', 'fail', 'kiosk']).optional(),
});

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function createPaymentsModule(deps: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
  bookings: Pick<BookingsService, 'confirmPaid' | 'holdFor'>;
  config: Pick<Config, 'payments' | 'publicWebUrl' | 'appEnv'>;
  logger: Logger;
  /** Tests inject a gateway. */
  gateway?: PaymentGateway;
}) {
  const gateway =
    deps.gateway ??
    (deps.config.payments.mode === 'paymob'
      ? createPaymobGateway(deps.config.payments)
      : createFakeGateway({ publicWebUrl: deps.config.publicWebUrl }));
  const payments = createPaymentsService({
    db: deps.db,
    gateway,
    bookings: deps.bookings,
    publicWebUrl: deps.config.publicWebUrl,
    logger: deps.logger,
  });
  const authenticate: RequestHandler = deps.auth.authenticate('web');

  return {
    payments,
    gateway,
    mount(v1: Router) {
      const pay = Router();
      pay.post('/:id/pay', authenticate, requireRole('student'), async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        const { method } = parseInput(payBody, req.body);
        if (!req.auth) throw Errors.unauthenticated();
        sendData(res, await payments.start(req.auth.userId, id, method));
      });
      v1.use('/bookings', pay);

      const r = Router();
      r.get('/methods', (_req, res) => {
        sendData(res, { methods: gateway.methods, mode: gateway.name });
      });

      r.post('/paymob/webhook', async (req, res) => {
        const body = req.body as { type?: string; obj?: PaymobTransaction } | undefined;
        const hmac = typeof req.query.hmac === 'string' ? req.query.hmac : '';
        if (body?.type === 'TRANSACTION' && body.obj) {
          const result = await payments.handleTransaction(body.obj, hmac);
          deps.logger.info({ result, txn: body.obj.id }, 'payment callback');
        }
        // Always 200: a bad or repeated callback is recorded, and retrying wouldn't change it.
        res.status(200).json({ received: true });
      });

      if (gateway.name === 'fake' && deps.config.appEnv !== 'production') {
        r.get('/fake/checkout/:paymentId', async (req, res) => {
          const { paymentId } = parseInput(fakeParams, req.params);
          const p = await deps.db.payment.findUnique({
            where: { id: paymentId },
            select: { amountPiasters: true, method: true, status: true },
          });
          if (!p) throw Errors.notFound('الدفعة دي مش موجودة.');
          const action = (o: string) => `/api/v1/payments/fake/checkout/${paymentId}/${o}`;
          res.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
          );
          // With the API's default no-referrer policy the browser posts the form with `Origin: null`,
          // which the CORS allowlist refuses.
          res.setHeader('Referrer-Policy', 'same-origin');
          res.type('html')
            .send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>دفع تجريبي — سابق</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f3ee;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border:1px solid #e3ded3;border-radius:16px;padding:28px;max-width:420px;width:calc(100% - 32px)}
h1{font-size:22px;margin:0 0 6px}p{color:#555;line-height:1.7}b.amt{font-size:28px}
.warn{background:#fff6e0;border:1px solid #f1d28a;border-radius:10px;padding:10px 12px;font-size:14px}
form{margin-top:10px}button{font:inherit;width:100%;height:48px;border-radius:10px;border:1px solid #0f6b55;font-size:16px;cursor:pointer}
.ok{background:#0f6b55;color:#fff}.bad{background:#fff;color:#b42318;border-color:#b42318}.k{background:#fff;color:#0f6b55}</style></head>
<body><main><h1>صفحة دفع تجريبية</h1>
<p class="warn">دي مش Paymob. دي صفحة تجربة على جهاز التطوير بس، ومفيش أي فلوس حقيقية. لما حساب Paymob يتفعّل، الطالب هيروح لصفحة Paymob الحقيقية بدلها.</p>
<p>المبلغ: <b class="amt">${escape(String(p.amountPiasters / 100))} ج.م</b> · ${escape(p.method)}</p>
${
  p.status === 'pending'
    ? `<form method="post" action="${action('success')}"><button class="ok">الدفع نجح</button></form>
<form method="post" action="${action('fail')}"><button class="bad">البنك رفض العملية</button></form>
${p.method === 'kiosk' ? `<form method="post" action="${action('kiosk')}"><button class="k">طلّع كود المنفذ (لسه ما اتدفعش)</button></form>` : ''}`
    : `<p>الدفعة دي حالتها: ${escape(p.status)}.</p>`
}
</main></body></html>`);
        });

        r.post('/fake/checkout/:paymentId/:outcome', async (req, res) => {
          const { paymentId, outcome } = parseInput(fakeParams, req.params);
          const p = await deps.db.payment.findUnique({
            where: { id: paymentId },
            select: {
              amountPiasters: true,
              providerOrderId: true,
              booking: { select: { id: true, mentor: { select: { slug: true } } } },
            },
          });
          if (!p) throw Errors.notFound('الدفعة دي مش موجودة.');
          // A Paymob-shaped transaction, signed like Paymob signs it, through the real handler.
          const obj: PaymobTransaction = {
            id: Math.floor(Date.now() % 1e9) + Math.floor(Math.random() * 1000),
            amount_cents: p.amountPiasters,
            created_at: new Date().toISOString(),
            currency: 'EGP',
            error_occured: outcome === 'fail',
            has_parent_transaction: false,
            integration_id: 1,
            is_3d_secure: true,
            is_auth: false,
            is_capture: false,
            is_refunded: false,
            is_standalone_payment: true,
            is_voided: false,
            owner: 1,
            pending: outcome === 'kiosk',
            success: outcome === 'success',
            order: { id: Number.NaN, merchant_order_id: paymentId },
            source_data: { pan: '4242', sub_type: 'Visa', type: 'card' },
            data:
              outcome === 'fail'
                ? { message: 'البنك رفض العملية (تجربة)' }
                : outcome === 'kiosk'
                  ? { bill_reference: 7_000_000 + Math.floor(Math.random() * 999_999) }
                  : null,
          };
          obj.order.id = Number(p.providerOrderId?.replace(/\D/g, '').slice(0, 9) || 0);
          await payments.handleTransaction(
            obj,
            paymobHmac(obj as unknown as Record<string, unknown>, gateway.hmacSecret),
          );
          res.redirect(
            303,
            `${deps.config.publicWebUrl}/book/${p.booking.mentor.slug}/done?booking=${p.booking.id}`,
          );
        });
      }

      v1.use('/payments', r);
    },
  };
}
