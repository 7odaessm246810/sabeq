/**
 * Mentor (website):
 *   GET  /api/v1/me/mentor/payout-account          → { account }  (masked) | null
 *   PUT  /api/v1/me/mentor/payout-account          { method, … }  → { account }
 *   GET  /api/v1/me/mentor/earnings                → { balanceEgp, earnedEgp, paidEgp, payouts }
 * Finance (admin app):
 *   GET  /api/v1/admin/payouts/balances            → { mentors }
 *   GET  /api/v1/admin/payouts/accounts/:mentorId  → { details }   (full — audited)
 *   POST /api/v1/admin/payouts                     { mentorId, amountEgp, reference } → { payout }
 *   GET  /api/v1/admin/payouts                     ?page → { items, page }
 */
import { normalizeEgyptianMobile } from '@sabeq/utils';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import { actorOf } from '../admin/audit.js';
import type { createAuthModule } from '../auth/index.js';
import { requireAdmin, requireRole } from '../auth/index.js';
import { createPayoutsService } from './payouts.service.js';

const text = (min: number, max: number, msg: string) =>
  z.string({ error: msg }).trim().min(min, msg).max(max, msg);

const accountBody = z.discriminatedUnion(
  'method',
  [
    z
      .object({
        method: z.literal('instapay'),
        address: text(3, 60, 'اكتب عنوان InstaPay (زي name@instapay) أو رقم الموبايل.'),
      })
      .strict(),
    z
      .object({
        method: z.literal('vodafone_cash'),
        phone: z.string({ error: 'اكتب رقم فودافون كاش.' }).transform((s, ctx) => {
          const n = normalizeEgyptianMobile(s);
          if (!n) {
            ctx.addIssue({ code: 'custom', message: 'رقم الموبايل ده مش مظبوط.' });
            return z.NEVER;
          }
          return n;
        }),
      })
      .strict(),
    z
      .object({
        method: z.literal('bank_transfer'),
        bankName: text(2, 60, 'اكتب اسم البنك.'),
        accountHolder: text(2, 60, 'اكتب اسم صاحب الحساب زي ما هو في البنك.'),
        accountNumber: z
          .string({ error: 'اكتب رقم الحساب أو الـ IBAN.' })
          .transform((s) => s.replace(/[\s-]/g, '').toUpperCase())
          .pipe(
            z
              .string()
              .regex(
                /^(EG\d{27}|\d{6,30})$/,
                'رقم الحساب أو الـ IBAN مش مظبوط (IBAN مصري: EG و27 رقم).',
              ),
          ),
      })
      .strict(),
  ],
  { error: 'اختار طريقة الاستلام.' },
);

const mentorParam = z.object({ mentorId: z.uuid() });
const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });
const payoutBody = z
  .object({
    mentorId: z.uuid(),
    amountEgp: z
      .number({ error: 'اكتب المبلغ.' })
      .positive('المبلغ لازم يكون أكبر من صفر.')
      .max(1_000_000)
      .refine(
        (n) =>
          Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
        'المبلغ بالقروش بحد أقصى.',
      ),
    reference: text(3, 120, 'اكتب رقم العملية من البنك أو InstaPay.'),
  })
  .strict();

export function createPayoutsModule(deps: {
  db: Db;
  crypto: DocumentCrypto;
  auth: ReturnType<typeof createAuthModule>;
}) {
  const payouts = createPayoutsService({ db: deps.db, crypto: deps.crypto });
  const web: RequestHandler = deps.auth.authenticate('web');
  const admin: RequestHandler = deps.auth.authenticate('admin');
  const userId = (req: Express.Request) => {
    if (!req.auth) throw Errors.unauthenticated();
    return req.auth.userId;
  };

  return {
    payouts,
    mount(v1: Router) {
      const me = Router();
      me.use(web, requireRole('mentor'));
      me.get('/payout-account', async (req, res) => {
        sendData(res, { account: await payouts.getAccount(userId(req)) });
      });
      me.put('/payout-account', async (req, res) => {
        const details = parseInput(accountBody, req.body);
        sendData(res, { account: await payouts.setAccount(userId(req), details) });
      });
      me.get('/earnings', async (req, res) => {
        sendData(res, await payouts.earnings(userId(req)));
      });
      v1.use('/me/mentor', me);

      const fin = Router();
      fin.use(admin, requireAdmin('finance'));
      fin.get('/balances', async (_req, res) => {
        sendData(res, { mentors: await payouts.balances() });
      });
      fin.get('/accounts/:mentorId', async (req, res) => {
        const { mentorId } = parseInput(mentorParam, req.params);
        sendData(res, { details: await payouts.reveal(actorOf(req), mentorId) });
      });
      fin.post('/', async (req, res) => {
        const body = parseInput(payoutBody, req.body);
        const payout = await payouts.record(actorOf(req), {
          mentorId: body.mentorId,
          amountPiasters: Math.round(body.amountEgp * 100),
          reference: body.reference,
        });
        sendData(res, { payout }, undefined, 201);
      });
      fin.get('/', async (req, res) => {
        const { page } = parseInput(pageQuery, req.query);
        sendData(res, await payouts.history(page));
      });
      v1.use('/admin/payouts', fin);
    },
  };
}
