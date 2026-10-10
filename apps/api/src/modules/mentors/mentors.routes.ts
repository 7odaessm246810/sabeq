/**
 * Public  /api/v1/mentors
 *   GET  /                ?field&faculty&university&sort&page&pageSize → { total, page, pageSize, results }
 *   GET  /:slug           → { mentor }   (listed mentors only) · 404
 *
 * The mentor  /api/v1/me/mentor   (role mentor)
 *   GET    /              → { mentor }   · 404 until the application is approved
 *   PATCH  /              { bio?, city?, topics?, basePriceEgp?, acceptsBookings?, departmentId? }
 *   PUT    /photo         raw PNG / JPEG / WebP ≤ 512 KB → { photo }
 *   DELETE /photo
 *
 * Students  /api/v1/me/saved-mentors   (role student)
 *   GET / · PUT /:slug · DELETE /:slug
 */
import {
  GOVERNORATES,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  MENTOR_PRICE_EGP,
  MENTOR_PROFILE_LIMITS,
} from '@sabeq/types';
import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import { requireRole } from '../auth/index.js';
import type { MentorsService } from './mentors.service.js';

const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

const listQuery = z.object({
  field: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  faculty: z.uuid().optional(),
  university: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  sort: z.enum(['recommended', 'rating', 'price_asc', 'price_desc']).default('recommended'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(12),
});

const { bio, topics, topic } = MENTOR_PROFILE_LIMITS;
const ownPatch = z
  .object({
    bio: z.string().trim().max(bio, `اكتب ${bio} حرف بالكتير.`).optional(),
    city: z.enum(GOVERNORATES, { error: 'اختار المحافظة.' }).nullable().optional(),
    topics: z
      .array(
        z
          .string()
          .transform((s) => s.replace(/\s+/g, ' ').trim())
          .pipe(z.string().min(2, 'الموضوع قصير.').max(topic, `الموضوع ${topic} حرف بالكتير.`)),
      )
      .max(topics, `${topics} مواضيع بالكتير.`)
      .refine((t) => new Set(t).size === t.length, 'في موضوع متكرر.')
      .optional(),
    basePriceEgp: z
      .number({ error: 'حدد السعر.' })
      .int()
      .min(MENTOR_PRICE_EGP.min, `السعر من ${MENTOR_PRICE_EGP.min} لـ ${MENTOR_PRICE_EGP.max} ج.م.`)
      .max(MENTOR_PRICE_EGP.max, `السعر من ${MENTOR_PRICE_EGP.min} لـ ${MENTOR_PRICE_EGP.max} ج.م.`)
      .refine(
        (n) => n % MENTOR_PRICE_EGP.step === 0,
        `السعر بيزيد ${MENTOR_PRICE_EGP.step} ج.م كل مرة.`,
      )
      .optional(),
    acceptsBookings: z.boolean().optional(),
    departmentId: z.uuid().nullable().optional(),
  })
  .strict();

const userId = (req: Express.Request) => {
  if (!req.auth) throw Errors.unauthenticated();
  return req.auth.userId;
};

export function mentorsRouter({ mentors }: { mentors: MentorsService }): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    sendData(res, await mentors.list(parseInput(listQuery, req.query)));
  });

  r.get('/:slug', async (req, res) => {
    const { slug } = parseInput(slugParam, req.params);
    const mentor = await mentors.profile(slug);
    if (!mentor) throw Errors.notFound('المرشد ده مش موجود أو مش متاح دلوقتي.');
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    sendData(res, { mentor });
  });

  return r;
}

export function ownMentorRouter(deps: {
  mentors: MentorsService;
  authenticate: RequestHandler;
}): Router {
  const { mentors, authenticate } = deps;
  const r = Router();
  r.use(authenticate, requireRole('mentor'));

  r.get('/', async (req, res) => {
    sendData(res, { mentor: await mentors.own(userId(req)) });
  });

  r.patch('/', async (req, res) => {
    sendData(res, { mentor: await mentors.updateOwn(userId(req), parseInput(ownPatch, req.body)) });
  });

  r.put(
    '/photo',
    express.raw({ type: [...LOGO_TYPES], limit: LOGO_MAX_BYTES }),
    async (req, res) => {
      sendData(res, { photo: await mentors.setPhoto(userId(req), req.body) });
    },
  );

  r.delete('/photo', async (req, res) => {
    await mentors.removePhoto(userId(req));
    sendData(res, { photo: null });
  });

  return r;
}

export function savedMentorsRouter(deps: {
  mentors: MentorsService;
  authenticate: RequestHandler;
}): Router {
  const { mentors, authenticate } = deps;
  const r = Router();
  r.use(authenticate, requireRole('student'));

  r.get('/', async (req, res) => {
    sendData(res, { mentors: await mentors.saved(userId(req)) });
  });

  r.put('/:slug', async (req, res) => {
    const { slug } = parseInput(slugParam, req.params);
    await mentors.save(userId(req), slug);
    sendData(res, { saved: true });
  });

  r.delete('/:slug', async (req, res) => {
    const { slug } = parseInput(slugParam, req.params);
    await mentors.unsave(userId(req), slug);
    sendData(res, { saved: false });
  });

  return r;
}
