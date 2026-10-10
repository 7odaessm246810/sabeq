/**
 *   POST /api/v1/bookings/:id/join    student or mentor of a confirmed booking, while the room is
 *                                     open → { provider, url, closesAt } (url null for the test room)
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
import { createSessionsService } from './sessions.service.js';
import { createDailyProvider, createFakeVideoProvider, type VideoProvider } from './video.js';

const idParam = z.object({ id: z.uuid() });

export function createSessionsModule(deps: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
  bookings: Pick<BookingsService, 'mentorNoShow'>;
  config: Pick<Config, 'video'>;
  logger: Logger;
  /** Tests inject a provider. */
  video?: VideoProvider;
}) {
  const video =
    deps.video ??
    (deps.config.video.provider === 'daily'
      ? createDailyProvider(deps.config.video)
      : createFakeVideoProvider());
  const sessions = createSessionsService({
    db: deps.db,
    video,
    bookings: deps.bookings,
    logger: deps.logger,
  });
  const authenticate: RequestHandler = deps.auth.authenticate('web');

  return {
    sessions,
    mount(v1: Router) {
      const r = Router();
      r.post('/:id/join', authenticate, requireRole('student', 'mentor'), async (req, res) => {
        const { id } = parseInput(idParam, req.params);
        if (!req.auth) throw Errors.unauthenticated();
        sendData(res, await sessions.join(req.auth.userId, id));
      });
      v1.use('/bookings', r);
    },
  };
}
