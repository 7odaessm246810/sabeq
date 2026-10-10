/**
 *   POST /api/v1/bookings/:id/review     student, completed session → { review }   { rating 1–5, text? }
 *   GET  /api/v1/mentors/:slug/reviews   ?page   → { rating, ratingCount, reviews, hasMore }
 */
import { REVIEW_TEXT_MAX } from '@sabeq/types';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { requireRole } from '../auth/index.js';
import { createReviewsService } from './reviews.service.js';

const idParam = z.object({ id: z.uuid() });
const slugParam = z.object({ slug: z.string().min(1).max(80) });
const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(100).default(1) });
const reviewBody = z
  .object({
    rating: z.number().int().min(1, 'اختار من 1 لـ 5 نجوم.').max(5, 'اختار من 1 لـ 5 نجوم.'),
    text: z.string().max(REVIEW_TEXT_MAX, `التقييم أطول من ${REVIEW_TEXT_MAX} حرف.`).optional(),
  })
  .strict();

export function createReviewsModule(deps: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
  onRatingChanged?: () => void;
}) {
  const reviews = createReviewsService({
    db: deps.db,
    ...(deps.onRatingChanged ? { onRatingChanged: deps.onRatingChanged } : {}),
  });
  const authenticate: RequestHandler = deps.auth.authenticate('web');

  return {
    reviews,
    mount(v1: Router) {
      const b = Router();
      b.post('/:id/review', authenticate, requireRole('student'), async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        const body = parseInput(reviewBody, req.body);
        if (!req.auth) throw Errors.unauthenticated();
        const review = await reviews.create(req.auth.userId, id, {
          rating: body.rating,
          ...(body.text === undefined ? {} : { text: body.text }),
        });
        sendData(res, { review }, undefined, 201);
      });
      v1.use('/bookings', b);

      const m = Router();
      m.get('/:slug/reviews', async (req, res) => {
        const { slug } = parseInput(slugParam, req.params);
        const { page } = parseInput(pageQuery, req.query);
        sendData(res, await reviews.forMentor(slug, page));
      });
      v1.use('/mentors', m);
    },
  };
}
