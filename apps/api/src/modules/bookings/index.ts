/**
 * /api/v1/bookings   (signed-in website users)
 *   POST   /                { mentorSlug, kind, startsAt, note? }   student → { booking } (pending, held)
 *   GET    /?scope=upcoming|past                                    → { bookings } (own, by role)
 *   GET    /:id                                                     → { booking } (participants)
 *   POST   /:id/dev-pay     local development only (until Paymob)   → { booking } (confirmed)
 *   POST   /:id/cancel      { reason? }  student or mentor          → { booking }
 *   POST   /:id/complete    mentor, after the end                   → { booking }
 *   POST   /:id/no-show     mentor, 15 min after the start          → { booking }
 */
import { SESSION_KINDS } from '@sabeq/types';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { requireAuth, requireRole } from '../auth/index.js';
import type { SchedulingService } from '../scheduling/scheduling.service.js';
import { createBookingsService } from './bookings.service.js';

const createBody = z
  .object({
    mentorSlug: z.string().regex(/^[a-z0-9-]{1,80}$/),
    kind: z.enum(SESSION_KINDS, { error: 'اختار نوع الجلسة.' }),
    startsAt: z.iso.datetime({ error: 'اختار الموعد.' }),
    note: z.string().trim().max(1000, 'اكتب 1000 حرف بالكتير.').optional(),
  })
  .strict();
const idParam = z.object({ id: z.uuid() });
const scopeQuery = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') });
const cancelBody = z
  .object({ reason: z.string().trim().max(500, 'اكتب 500 حرف بالكتير.').optional() })
  .strict();

export function createBookingsModule(deps: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
  scheduling: SchedulingService;
  appEnv: 'local' | 'staging' | 'production';
  now?: () => Date;
}) {
  const bookings = createBookingsService(deps);
  const authenticate: RequestHandler = deps.auth.authenticate('web');
  const who = (req: Express.Request) => {
    if (!req.auth) throw Errors.unauthenticated();
    return req.auth;
  };

  return {
    bookings,
    mount(v1: Router) {
      const r = Router();
      r.use(authenticate, requireAuth());

      r.post('/', requireRole('student'), async (req, res) => {
        const body = parseInput(createBody, req.body);
        sendData(res, { booking: await bookings.create(who(req).userId, body) }, undefined, 201);
      });

      r.get('/', requireRole('student', 'mentor'), async (req, res) => {
        const { scope } = parseInput(scopeQuery, req.query);
        const { userId, role } = who(req);
        sendData(res, {
          bookings: await bookings.list(userId, role as 'student' | 'mentor', scope),
        });
      });

      r.get('/:id', async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        sendData(res, { booking: await bookings.get(who(req).userId, id) });
      });

      r.post('/:id/dev-pay', requireRole('student'), async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        sendData(res, { booking: await bookings.devPay(who(req).userId, id) });
      });

      r.post('/:id/cancel', async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        const { reason } = parseInput(cancelBody, req.body ?? {});
        sendData(res, { booking: await bookings.cancel(who(req).userId, id, reason) });
      });

      r.post('/:id/complete', requireRole('mentor'), async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        sendData(res, { booking: await bookings.complete(who(req).userId, id) });
      });

      r.post('/:id/no-show', requireRole('mentor'), async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        sendData(res, { booking: await bookings.noShow(who(req).userId, id) });
      });

      v1.use('/bookings', r);
    },
  };
}
