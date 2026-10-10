/**
 * Public  /api/v1/mentors/:slug/availability?kind   → { timezone, kind, durationMin, next, days }
 *
 * The mentor  /api/v1/me/availability   (role mentor)
 *   GET                     → { timezone, rules, exceptions, upcoming, limits }
 *   PUT    rules            { rules: [{ weekday, startMinute, endMinute }] }   (replaces all)
 *   POST   exceptions       { date, kind: blocked|extra, startMinute?, endMinute? }
 *   DELETE exceptions/:id
 *
 * weekday: 0 = Sunday … 6 = Saturday; minutes since midnight, Cairo time.
 */
import { SESSION_KINDS } from '@sabeq/types';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { requireRole } from '../auth/index.js';
import { createSchedulingService } from './scheduling.service.js';

const minute = z.number().int().min(0).max(1440);
const rulesBody = z
  .object({
    rules: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            startMinute: minute,
            endMinute: minute,
          })
          .strict()
          .refine((r) => r.startMinute < r.endMinute, 'وقت النهاية لازم يكون بعد البداية.'),
      )
      .max(28),
  })
  .strict();
const exceptionBody = z
  .object({
    date: z.iso.date({ error: 'اختار التاريخ.' }),
    kind: z.enum(['blocked', 'extra']),
    startMinute: minute.nullable().optional(),
    endMinute: minute.nullable().optional(),
  })
  .strict()
  .refine(
    (e) =>
      e.startMinute === null ||
      e.startMinute === undefined ||
      e.endMinute === null ||
      e.endMinute === undefined ||
      e.startMinute < e.endMinute,
    {
      path: ['endMinute'],
      message: 'وقت النهاية لازم يكون بعد البداية.',
    },
  );
const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });
const kindQuery = z.object({ kind: z.enum(SESSION_KINDS).default('consultation') });
const idParam = z.object({ id: z.uuid() });

export function createSchedulingModule(deps: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
  now?: () => Date;
}) {
  const scheduling = createSchedulingService(deps);
  const authenticate: RequestHandler = deps.auth.authenticate('web');
  const userId = (req: Express.Request) => {
    if (!req.auth) throw Errors.unauthenticated();
    return req.auth.userId;
  };

  return {
    scheduling,
    mount(v1: Router) {
      const pub = Router();
      pub.get('/:slug/availability', async (req, res) => {
        const { slug } = parseInput(slugParam, req.params);
        const { kind } = parseInput(kindQuery, req.query);
        const availability = await scheduling.availability(slug, kind);
        if (!availability) throw Errors.notFound('المرشد ده مش موجود أو مش متاح دلوقتي.');
        // Slots change as people book: short cache only.
        res.setHeader('Cache-Control', 'public, max-age=30');
        sendData(res, { availability });
      });
      v1.use('/mentors', pub);

      const own = Router();
      own.use(authenticate, requireRole('mentor'));
      own.get('/', async (req, res) => {
        sendData(res, { availability: await scheduling.own(userId(req)) });
      });
      own.put('/rules', async (req, res) => {
        const { rules } = parseInput(rulesBody, req.body);
        sendData(res, { availability: await scheduling.setRules(userId(req), rules) });
      });
      own.post('/exceptions', async (req, res) => {
        const body = parseInput(exceptionBody, req.body);
        sendData(
          res,
          { availability: await scheduling.addException(userId(req), body) },
          undefined,
          201,
        );
      });
      own.delete('/exceptions/:id', async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        sendData(res, { availability: await scheduling.deleteException(userId(req), id) });
      });
      v1.use('/me/availability', own);
    },
  };
}
