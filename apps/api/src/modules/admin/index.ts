/**
 * The admin dashboard API (Phase 20) — admin-app sessions only; super admins pass every role check.
 *
 *   GET  /api/v1/admin/overview                               any admin → the numbers
 *   GET  /api/v1/admin/bookings          ?status&q&page        support, finance
 *   GET  /api/v1/admin/bookings/:id                           support, finance → payments, refunds, attendance, ledger
 *   POST /api/v1/admin/bookings/:id/refund  { reason }        support → full refund (audited)
 *   GET  /api/v1/admin/reviews           ?status&page          support
 *   POST /api/v1/admin/reviews/:id/status { status, note }    support → published | hidden (audited)
 *   GET  /api/v1/admin/users             ?q&role&status&page   support
 *   POST /api/v1/admin/users/:id/status   { status, note }    support → active | suspended (audited)
 * Payouts (finance) live in the payouts module; mentor applications in verification.
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { parseInput, sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { requireAdmin } from '../auth/index.js';
import type { BookingsService } from '../bookings/bookings.service.js';
import { createAdminService } from './admin.service.js';
import { actorOf } from './audit.js';

const idParam = z.object({ id: z.uuid() });
const page = z.coerce.number().int().min(1).max(1000).default(1);
const note = (msg: string) => z.string({ error: msg }).trim().min(3, msg).max(500);

const bookingsQuery = z.object({
  status: z
    .enum(['confirmed', 'cancelled', 'completed', 'no_show', 'refunded', 'pending'])
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
  page,
});
const reviewsQuery = z.object({
  status: z.enum(['published', 'hidden', 'flagged']).optional(),
  page,
});
const usersQuery = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  role: z.enum(['student', 'mentor']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page,
});
const refundBody = z.object({ reason: note('اكتب سبب الاسترداد (بيوصل للمرشد).') }).strict();
const reviewBody = z
  .object({ status: z.enum(['published', 'hidden']), note: note('اكتب السبب (بيتسجل في السجل).') })
  .strict();
const userBody = z
  .object({ status: z.enum(['active', 'suspended']), note: note('اكتب السبب (بيتسجل في السجل).') })
  .strict();

export function createAdminModule(deps: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
  bookings: Pick<BookingsService, 'adminRefund'>;
  onMentorsChanged?: () => void;
}) {
  const admin = createAdminService({
    db: deps.db,
    sessions: deps.auth.sessions,
    bookings: deps.bookings,
    ...(deps.onMentorsChanged ? { onMentorsChanged: deps.onMentorsChanged } : {}),
  });
  const authenticate: RequestHandler = deps.auth.authenticate('admin');

  return {
    admin,
    mount(v1: Router) {
      const r = Router();
      r.use(authenticate);
      const support = requireAdmin('support');

      r.get('/overview', requireAdmin(), async (_req, res) => {
        sendData(res, await admin.overview());
      });

      r.get('/bookings', requireAdmin('support', 'finance'), async (req, res) => {
        sendData(res, await admin.listBookings(parseInput(bookingsQuery, req.query)));
      });
      r.get('/bookings/:id', requireAdmin('support', 'finance'), async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        sendData(res, { booking: await admin.getBooking(id) });
      });
      r.post('/bookings/:id/refund', support, async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        const { reason } = parseInput(refundBody, req.body);
        sendData(res, { booking: await admin.refundBooking(actorOf(req), id, reason) });
      });

      r.get('/reviews', support, async (req, res) => {
        sendData(res, await admin.listReviews(parseInput(reviewsQuery, req.query)));
      });
      r.post('/reviews/:id/status', support, async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        const body = parseInput(reviewBody, req.body);
        sendData(res, {
          review: await admin.setReviewStatus(actorOf(req), id, body.status, body.note),
        });
      });

      r.get('/users', support, async (req, res) => {
        sendData(res, await admin.listUsers(parseInput(usersQuery, req.query)));
      });
      r.post('/users/:id/status', support, async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        const body = parseInput(userBody, req.body);
        sendData(res, {
          user: await admin.setUserStatus(actorOf(req), id, body.status, body.note),
        });
      });

      v1.use('/admin', r);
    },
  };
}
